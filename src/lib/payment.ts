import { createHash } from "crypto";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
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

  if (opts.method === "PIX" && !obligation.pixPayload) {
    return {
      error:
        "Guia sem PIX oficial (pixPayload). Importe/emita a guia real antes de cobrar.",
      status: 400 as const,
    };
  }
  if (opts.method === "BOLETO" && !obligation.barcode) {
    return {
      error:
        "Guia sem código de barras oficial. Importe/emita a guia real antes de cobrar.",
      status: 400 as const,
    };
  }

  const existing = await prisma.payment.findFirst({
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

  const txid = createHash("sha256")
    .update(`${obligation.id}:${Date.now()}`)
    .digest("hex")
    .slice(0, 32);
  const providerRef = `official_${opts.method.toLowerCase()}_${txid.slice(0, 12)}`;
  const expiresAt =
    obligation.dueAt ?? new Date(Date.now() + 1000 * 60 * 60 * 24);

  const payment = await prisma.payment.create({
    data: {
      firmId: opts.firmId,
      obligationId: obligation.id,
      method: opts.method,
      status: "PENDING",
      amountCents: obligation.amountCents,
      pixCopyPaste: opts.method === "PIX" ? obligation.pixPayload : null,
      boletoBarcode: opts.method === "BOLETO" ? obligation.barcode : null,
      boletoDigitable: opts.method === "BOLETO" ? obligation.barcode : null,
      providerRef,
      expiresAt,
    },
  });

  return { payment, reused: false };
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
      "COMPROVANTE REGISTRADO — HUB Contábil OS",
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
