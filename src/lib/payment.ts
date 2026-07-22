import { createHash, randomBytes } from "crypto";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { prisma } from "@/lib/db";
import { formatBrl } from "@/lib/utils";

export type PayMethod = "PIX" | "BOLETO";

function pad(n: number, len: number) {
  return String(n).padStart(len, "0");
}

function mockPixPayload(opts: {
  amountCents: number;
  txid: string;
  firmName: string;
}) {
  // EMV-like demo payload (not a real BR Code — for UX/demo only)
  const amount = (opts.amountCents / 100).toFixed(2);
  return (
    `00020126580014BR.GOV.BCB.PIX0136${opts.txid}` +
    `520400005303986540${amount.length}${amount}` +
    `5802BR5913${opts.firmName.slice(0, 13).padEnd(13, "X")}` +
    `6009SAO PAULO62070503***6304ABCD`
  );
}

function mockBoleto(amountCents: number) {
  const bank = "001";
  const currency = "9";
  const value = pad(amountCents, 10);
  const field =
    `${bank}${currency}9${randomBytes(4).toString("hex").slice(0, 5)}` +
    `${randomBytes(10).toString("hex")}`.slice(0, 25) +
    value;
  const barcode = field.replace(/\D/g, "").padEnd(44, "0").slice(0, 44);
  const digitable = `${barcode.slice(0, 5)}.${barcode.slice(5, 10)} ${barcode.slice(10, 15)}.${barcode.slice(15, 21)} ${barcode.slice(21, 26)}.${barcode.slice(26, 32)} ${barcode.slice(32, 33)} ${barcode.slice(33)}`;
  return { barcode, digitable };
}

async function writeProof(opts: {
  firmId: string;
  paymentId: string;
  content: string;
}) {
  const dir = path.join(process.cwd(), "data", "proofs", opts.firmId);
  await mkdir(dir, { recursive: true });
  const filePath = path.join(dir, `${opts.paymentId}.txt`);
  await writeFile(filePath, content, "utf8");
  return filePath;
}

/**
 * Provider de pagamento de tributos.
 * MOCK hoje; hooks para PSP real (Pag Útil / Open Finance) via PAYMENT_MODE=live.
 */
export async function createGuidePayment(opts: {
  firmId: string;
  firmName: string;
  obligationId: string;
  method: PayMethod;
}) {
  const obligation = await prisma.obligation.findFirst({
    where: { id: opts.obligationId, firmId: opts.firmId },
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

  const mode = process.env.PAYMENT_MODE ?? "mock";
  const txid = createHash("sha256")
    .update(`${obligation.id}:${Date.now()}`)
    .digest("hex")
    .slice(0, 32);
  const providerRef = `${mode}_${opts.method.toLowerCase()}_${txid.slice(0, 12)}`;
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24);

  let pixCopyPaste: string | null = null;
  let boletoBarcode: string | null = null;
  let boletoDigitable: string | null = null;

  if (opts.method === "PIX") {
    pixCopyPaste = mockPixPayload({
      amountCents: obligation.amountCents,
      txid,
      firmName: opts.firmName,
    });
  } else {
    const b = mockBoleto(obligation.amountCents);
    boletoBarcode = b.barcode;
    boletoDigitable = b.digitable;
  }

  const payment = await prisma.payment.create({
    data: {
      firmId: opts.firmId,
      obligationId: obligation.id,
      method: opts.method,
      status: "PENDING",
      amountCents: obligation.amountCents,
      pixCopyPaste,
      boletoBarcode,
      boletoDigitable,
      providerRef,
      expiresAt,
    },
  });

  await prisma.obligation.update({
    where: { id: obligation.id },
    data: {
      barcode: boletoBarcode ?? obligation.barcode,
    },
  });

  return { payment, reused: false };
}

export async function confirmGuidePayment(opts: {
  firmId: string;
  paymentId: string;
}) {
  const payment = await prisma.payment.findFirst({
    where: { id: opts.paymentId, firmId: opts.firmId },
    include: {
      obligation: { include: { client: true } },
    },
  });
  if (!payment) return { error: "Pagamento não encontrado", status: 404 as const };
  if (payment.status === "PAID") return { payment, already: true };

  const now = new Date();
  const proof = [
    "COMPROVANTE DE PAGAMENTO DE TRIBUTO — HUB Contábil OS",
    `Ref: ${payment.providerRef}`,
    `Método: ${payment.method}`,
    `Valor: ${formatBrl(payment.amountCents)}`,
    `Guia: ${payment.obligation.type} ${payment.obligation.competence}`,
    `Cliente: ${payment.obligation.client.tradeName ?? payment.obligation.client.legalName}`,
    `CNPJ: ${payment.obligation.client.cnpj}`,
    `Pago em: ${now.toISOString()}`,
    "Status: CONFIRMADO (provider mock — substituível por PSP real)",
  ].join("\n");

  const proofPath = await writeProof({
    firmId: opts.firmId,
    paymentId: payment.id,
    content: proof,
  });

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
