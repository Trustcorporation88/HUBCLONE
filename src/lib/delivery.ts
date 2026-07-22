import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { prisma } from "@/lib/db";
import { formatBrl } from "@/lib/utils";
import { sendRealEmail } from "@/lib/email";

export type SendChannel = "EMAIL" | "WHATSAPP_MANUAL";

type ObligationWithClient = {
  id: string;
  firmId: string;
  type: string;
  competence: string;
  amountCents: number | null;
  dueAt: Date | null;
  status: string;
  barcode: string | null;
  client: {
    tradeName: string | null;
    legalName: string;
    email: string | null;
    whatsapp: string | null;
    cnpj: string;
  };
};

export function buildGuideMessage(o: ObligationWithClient, firmName: string) {
  const clientName = o.client.tradeName ?? o.client.legalName;
  const due = o.dueAt
    ? o.dueAt.toLocaleDateString("pt-BR")
    : "a confirmar";
  return (
    `${firmName}: guia ${o.type} competência ${o.competence} ` +
    `de ${clientName} — valor ${formatBrl(o.amountCents)}, vencimento ${due}.`
  );
}

export function buildGuideFileContent(
  o: ObligationWithClient,
  firmName: string,
) {
  const clientName = o.client.tradeName ?? o.client.legalName;
  const due = o.dueAt
    ? o.dueAt.toLocaleDateString("pt-BR")
    : "a confirmar";
  return [
    `GUIA DE IMPOSTO — ${firmName}`,
    "".padEnd(48, "="),
    `Tipo: ${o.type}`,
    `Competência: ${o.competence}`,
    `Cliente: ${clientName}`,
    `CNPJ: ${o.client.cnpj}`,
    `Valor: ${formatBrl(o.amountCents)}`,
    `Vencimento: ${due}`,
    o.barcode ? `Código de barras: ${o.barcode}` : null,
    "".padEnd(48, "-"),
    "Arquivo gerado pelo HUB Contábil OS.",
    "Anexe este arquivo no WhatsApp e envie ao cliente.",
    `Gerado em: ${new Date().toLocaleString("pt-BR")}`,
  ]
    .filter(Boolean)
    .join("\n");
}

export function whatsappDeepLink(phone: string, text: string) {
  const digits = phone.replace(/\D/g, "");
  const normalized = digits.startsWith("55") ? digits : `55${digits}`;
  return `https://wa.me/${normalized}?text=${encodeURIComponent(text)}`;
}

async function dispatchEmail(
  to: string,
  subject: string,
  body: string,
  attachment?: { filename: string; content: string },
) {
  const info = await sendRealEmail({
    to,
    subject,
    text: body,
    attachments: attachment
      ? [{ filename: attachment.filename, content: attachment.content }]
      : undefined,
  });
  return { ok: true as const, providerMsgId: info.messageId };
}

export async function ensureGuideFile(opts: {
  firmId: string;
  firmName: string;
  obligationId: string;
}) {
  const obligation = await prisma.obligation.findFirst({
    where: { id: opts.obligationId, firmId: opts.firmId },
    include: { client: true },
  });
  if (!obligation) return { error: "Guia não encontrada", status: 404 as const };

  const content = buildGuideFileContent(obligation, opts.firmName);
  const dir = path.join(process.cwd(), "data", "guides", opts.firmId);
  await mkdir(dir, { recursive: true });
  const filePath = path.join(dir, `${obligation.id}.txt`);
  await writeFile(filePath, content, "utf8");
  const fileName = `${obligation.type}_${obligation.competence}_${obligation.id.slice(0, 6)}.txt`;

  return { obligation, content, filePath, fileName };
}

/**
 * E-mail = envio automático.
 * WhatsApp = NÃO usa Meta/Twilio: gera arquivo + link wa.me para o usuário anexar e enviar.
 */
export async function sendObligationGuide(opts: {
  firmId: string;
  firmName: string;
  obligationId: string;
  channels: SendChannel[];
}) {
  const obligation = await prisma.obligation.findFirst({
    where: { id: opts.obligationId, firmId: opts.firmId },
    include: { client: true },
  });

  if (!obligation) {
    return { error: "Guia não encontrada", status: 404 as const };
  }

  if (["PAID", "CANCELLED"].includes(obligation.status)) {
    return {
      error: `Guia em status ${obligation.status} não pode ser enviada`,
      status: 400 as const,
    };
  }

  const body = buildGuideMessage(obligation, opts.firmName);
  const results: Array<{
    channel: SendChannel;
    deliveryId: string;
    status: string;
    toAddress: string;
    downloadUrl?: string;
    whatsappUrl?: string;
  }> = [];

  for (const channel of opts.channels) {
    if (channel === "EMAIL") {
      const toAddress = obligation.client.email;
      if (!toAddress) {
        const failed = await prisma.delivery.create({
          data: {
            firmId: opts.firmId,
            obligationId: obligation.id,
            channel: "EMAIL",
            toAddress: "",
            status: "FAILED",
            bodyPreview: body.slice(0, 280),
            errorMessage: "Cliente sem e-mail cadastrado",
          },
        });
        results.push({
          channel,
          deliveryId: failed.id,
          status: "FAILED",
          toAddress: "",
        });
        continue;
      }

      const queued = await prisma.delivery.create({
        data: {
          firmId: opts.firmId,
          obligationId: obligation.id,
          channel: "EMAIL",
          toAddress,
          status: "QUEUED",
          bodyPreview: body.slice(0, 280),
        },
      });

      const subject = `Guia ${obligation.type} ${obligation.competence} — ${opts.firmName}`;
      const file = await ensureGuideFile({
        firmId: opts.firmId,
        firmName: opts.firmName,
        obligationId: obligation.id,
      });
      const attachment =
        "content" in file && file.content
          ? { filename: file.fileName!, content: file.content }
          : undefined;

      let dispatched:
        | { ok: true; providerMsgId: string }
        | { ok: false; error: string };
      try {
        dispatched = await dispatchEmail(toAddress, subject, body, attachment);
      } catch (e) {
        dispatched = {
          ok: false,
          error: e instanceof Error ? e.message : "Falha SMTP",
        };
      }
      const updated = await prisma.delivery.update({
        where: { id: queued.id },
        data: dispatched.ok
          ? {
              status: "SENT",
              providerMsgId: dispatched.providerMsgId,
              sentAt: new Date(),
            }
          : {
              status: "FAILED",
              errorMessage: dispatched.error,
            },
      });

      results.push({
        channel,
        deliveryId: updated.id,
        status: updated.status,
        toAddress,
      });
      continue;
    }

    // WHATSAPP_MANUAL
    const phone = obligation.client.whatsapp;
    await ensureGuideFile({
      firmId: opts.firmId,
      firmName: opts.firmName,
      obligationId: obligation.id,
    });

    const tip =
      `${body}\n\n` +
      `Segue a guia em anexo (baixe no HUB e anexe aqui).`;

    const delivery = await prisma.delivery.create({
      data: {
        firmId: opts.firmId,
        obligationId: obligation.id,
        channel: "WHATSAPP_MANUAL",
        toAddress: phone ?? "",
        status: phone ? "SENT" : "FAILED",
        bodyPreview: tip.slice(0, 280),
        errorMessage: phone
          ? null
          : "Cliente sem WhatsApp — baixe o arquivo e envie manualmente",
        sentAt: phone ? new Date() : null,
        providerMsgId: `manual_${Date.now()}`,
      },
    });

    results.push({
      channel,
      deliveryId: delivery.id,
      status: delivery.status,
      toAddress: phone ?? "",
      downloadUrl: `/api/obligations/${obligation.id}/file`,
      whatsappUrl: phone ? whatsappDeepLink(phone, tip) : undefined,
    });
  }

  const anyOk = results.some((r) => r.status === "SENT");
  if (anyOk) {
    await prisma.obligation.update({
      where: { id: obligation.id },
      data: {
        status: obligation.status === "VIEWED" ? "VIEWED" : "SENT",
        sentAt: new Date(),
      },
    });

    if (obligation.taskId) {
      await prisma.fiscalPipeline.updateMany({
        where: {
          firmId: opts.firmId,
          taskId: obligation.taskId,
          stage: "GUIDE",
        },
        data: { stage: "PAY", stageStatus: "NEEDS_APPROVAL" },
      });
    }
  }

  return { results, obligationId: obligation.id };
}

export async function markDeliveryViewed(opts: {
  firmId: string;
  deliveryId: string;
}) {
  const delivery = await prisma.delivery.findFirst({
    where: { id: opts.deliveryId, firmId: opts.firmId },
  });
  if (!delivery) return { error: "Envio não encontrado", status: 404 as const };

  const now = new Date();
  await prisma.delivery.update({
    where: { id: delivery.id },
    data: { status: "VIEWED", viewedAt: now },
  });
  await prisma.obligation.update({
    where: { id: delivery.obligationId },
    data: { status: "VIEWED", viewedAt: now },
  });

  return { ok: true };
}
