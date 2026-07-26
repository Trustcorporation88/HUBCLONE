import { createHash } from "crypto";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { formatBrl } from "@/lib/utils";

export type PayMethod = "PIX" | "BOLETO";

async function writeProof(opts: {
  firmId: string;
  paymentId: string;
  buffer: Buffer;
  ext: string;
}) {
  const dir = path.join(process.cwd(), "data", "proofs", opts.firmId);
  await mkdir(dir, { recursive: true });
  const filePath = path.join(dir, `${opts.paymentId}.${extSafe(opts.ext)}`);
  await writeFile(filePath, opts.buffer);
  return filePath;
}

function extSafe(ext: string) {
  return ext.replace(/[^a-z0-9]/gi, "") || "bin";
}

/**
 * Valida o BR Code do PIX (copia-e-cola, padrão EMV MPM do Bacen):
 * começa com "000201" (Payload Format Indicator) e termina com o campo CRC16
 * "6304" + 4 hexadecimais. Não recalcula o CRC (guias legítimas variam), mas
 * rejeita strings claramente fora do padrão.
 */
function isValidPixPayload(payload: string): boolean {
  const p = (payload || "").trim();
  if (p.length < 30 || p.length > 512) return false;
  if (!p.startsWith("000201")) return false;
  return /6304[0-9A-Fa-f]{4}$/.test(p);
}

/**
 * Valida código de barras / linha digitável de guia (DARF/GNRE/boleto):
 * apenas dígitos, entre 44 (código de barras) e 48 (linha digitável).
 */
function isValidBoletoCode(code: string): boolean {
  const digitsOnly = (code || "").replace(/\D/g, "");
  return digitsOnly.length >= 44 && digitsOnly.length <= 48;
}

const MIN_PROOF_BYTES = 512;

/**
 * Valida a assinatura binária (magic bytes) do comprovante — a extensão do
 * nome do arquivo é fornecida pelo cliente e facilmente falsificável (ex.:
 * renomear um arquivo de 1 byte para "comprovante.pdf" bastava antes).
 */
function matchesDeclaredExtension(buffer: Buffer, ext: string): boolean {
  if (buffer.length < 8) return false;
  const bytes = buffer.subarray(0, 12);
  if (ext === "pdf") return bytes.subarray(0, 5).toString("ascii") === "%PDF-";
  if (ext === "jpg" || ext === "jpeg") {
    return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  if (ext === "png") {
    return bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  }
  if (ext === "webp") {
    return (
      bytes.subarray(0, 4).toString("ascii") === "RIFF" &&
      bytes.subarray(8, 12).toString("ascii") === "WEBP"
    );
  }
  return false;
}

/**
 * Pagamento operacional: NÃO inventa PIX/boleto.
 * Usa apenas código oficial já gravado na guia (barcode / pixPayload).
 */
export async function createGuidePayment(opts: {
  firmId: string;
  firmName: string;
  obligationId: string;
  method: PayMethod;
  clientId?: string | null;
}) {
  const obligation = await prisma.obligation.findFirst({
    where: {
      id: opts.obligationId,
      firmId: opts.firmId,
      ...(opts.clientId ? { clientId: opts.clientId } : {}),
    },
    include: { client: true },
  });
  if (!obligation) return { error: "Guia não encontrada", status: 404 as const };
  if (obligation.status === "PAID") {
    return { error: "Guia já paga", status: 400 as const };
  }
  if (obligation.status === "CANCELLED") {
    return { error: "Guia cancelada", status: 400 as const };
  }
  if (obligation.amountCents == null || obligation.amountCents <= 0) {
    return { error: "Guia sem valor para pagamento", status: 400 as const };
  }

  if (opts.method === "PIX") {
    if (!obligation.pixPayload) {
      return {
        error:
          "Guia sem PIX oficial (pixPayload). Importe/emita a guia real antes de cobrar.",
        status: 400 as const,
      };
    }
    if (!isValidPixPayload(obligation.pixPayload)) {
      return {
        error:
          "PIX copia-e-cola da guia é inválido (BR Code fora do padrão EMV). Reimporte a guia oficial.",
        status: 400 as const,
      };
    }
  }
  if (opts.method === "BOLETO") {
    if (!obligation.barcode) {
      return {
        error:
          "Guia sem código de barras oficial. Importe/emita a guia real antes de cobrar.",
        status: 400 as const,
      };
    }
    if (!isValidBoletoCode(obligation.barcode)) {
      return {
        error:
          "Código de barras da guia é inválido (esperado 44 a 48 dígitos). Reimporte a guia oficial.",
        status: 400 as const,
      };
    }
  }

  const txid = createHash("sha256")
    .update(`${obligation.id}:${Date.now()}`)
    .digest("hex")
    .slice(0, 32);
  const providerRef = `official_${opts.method.toLowerCase()}_${txid.slice(0, 12)}`;
  const expiresAt =
    obligation.dueAt ?? new Date(Date.now() + 1000 * 60 * 60 * 24);
  const amountCents = obligation.amountCents; // já validado > 0 acima

  // Transação serializable: fecha a corrida entre dois cliques simultâneos —
  // reaproveita o PENDING existente ou cria um único novo, sem gerar
  // pagamentos duplicados para a mesma guia/método.
  try {
    const { payment, reused } = await prisma.$transaction(
      async (tx) => {
        const existing = await tx.payment.findFirst({
          where: {
            obligationId: obligation.id,
            status: "PENDING",
            method: opts.method,
          },
          orderBy: { createdAt: "desc" },
        });
        if (existing) {
          return { payment: existing, reused: true };
        }
        const created = await tx.payment.create({
          data: {
            firmId: opts.firmId,
            obligationId: obligation.id,
            method: opts.method,
            status: "PENDING",
            amountCents,
            pixCopyPaste: opts.method === "PIX" ? obligation.pixPayload : null,
            boletoBarcode: opts.method === "BOLETO" ? obligation.barcode : null,
            boletoDigitable: opts.method === "BOLETO" ? obligation.barcode : null,
            providerRef,
            expiresAt,
          },
        });
        return { payment: created, reused: false };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    return { payment, reused };
  } catch (e) {
    // Só tratamos como corrida quando o erro é REALMENTE falha de serialização
    // (Prisma P2034). Qualquer outro erro é propagado — não mascaramos bug de
    // código/conexão como "reaproveitamento de pagamento existente".
    const isSerializationError =
      e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2034";
    if (!isSerializationError) {
      throw e;
    }
    // A transação perdedora abortou — o vencedor já criou o PENDING; reaproveita.
    const winner = await prisma.payment.findFirst({
      where: {
        obligationId: obligation.id,
        status: "PENDING",
        method: opts.method,
      },
      orderBy: { createdAt: "desc" },
    });
    if (winner) return { payment: winner, reused: true };
    return { error: "Falha ao criar pagamento. Tente novamente.", status: 500 as const };
  }
}

/** Confirma pagamento somente com comprovante anexado (arquivo real). */
export async function confirmGuidePayment(opts: {
  firmId: string;
  paymentId: string;
  clientId?: string | null;
  proof: { buffer: Buffer; filename: string };
}) {
  const payment = await prisma.payment.findFirst({
    where: {
      id: opts.paymentId,
      firmId: opts.firmId,
      ...(opts.clientId
        ? { obligation: { clientId: opts.clientId } }
        : {}),
    },
    include: {
      obligation: { include: { client: true } },
    },
  });
  if (!payment) return { error: "Pagamento não encontrado", status: 404 as const };
  if (payment.status === "PAID") return { payment, already: true };

  if (!opts.proof?.buffer?.length) {
    return {
      error: "Envie o comprovante de pagamento (PDF/JPG/PNG).",
      status: 400 as const,
    };
  }

  const ext =
    opts.proof.filename.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") ||
    "bin";
  const allowed = ["pdf", "jpg", "jpeg", "png", "webp"];
  if (!allowed.includes(ext)) {
    return {
      error: "Comprovante deve ser PDF, JPG ou PNG.",
      status: 400 as const,
    };
  }

  if (opts.proof.buffer.length < MIN_PROOF_BYTES) {
    return {
      error: "Arquivo de comprovante muito pequeno para ser um documento válido.",
      status: 400 as const,
    };
  }

  if (!matchesDeclaredExtension(opts.proof.buffer, ext)) {
    return {
      error:
        "O conteúdo do arquivo não corresponde ao tipo declarado. Envie um PDF/JPG/PNG/WEBP real.",
      status: 400 as const,
    };
  }

  const now = new Date();
  const proofPath = await writeProof({
    firmId: opts.firmId,
    paymentId: payment.id,
    buffer: opts.proof.buffer,
    ext,
  });

  await writeFile(
    path.join(path.dirname(proofPath), `${payment.id}.meta.txt`),
    [
      "COMPROVANTE REGISTRADO — ProContador Office",
      `Ref: ${payment.providerRef}`,
      `Método: ${payment.method}`,
      `Valor: ${formatBrl(payment.amountCents)}`,
      `Guia: ${payment.obligation.type} ${payment.obligation.competence}`,
      `Cliente: ${payment.obligation.client.tradeName ?? payment.obligation.client.legalName}`,
      `Arquivo: ${opts.proof.filename}`,
      `Registrado em: ${now.toISOString()}`,
    ].join("\n"),
    "utf8",
  );

  const updated = await prisma.$transaction(async (tx) => {
    const p = await tx.payment.update({
      where: { id: payment.id },
      data: {
        status: "PAID",
        paidAt: now,
        proofPath,
      },
    });

    await tx.obligation.update({
      where: { id: payment.obligationId },
      data: {
        status: "PAID",
        paidAt: now,
        proofUrl: `/api/payments/${payment.id}/proof`,
      },
    });

    if (payment.obligation.taskId) {
      await tx.task.update({
        where: { id: payment.obligation.taskId },
        data: { status: "DONE", completedAt: now },
      });

      await tx.fiscalPipeline.updateMany({
        where: {
          firmId: opts.firmId,
          taskId: payment.obligation.taskId,
        },
        data: {
          stage: "CLOSE",
          stageStatus: "DONE",
        },
      });
    }

    return p;
  });

  return { payment: updated, already: false };
}
