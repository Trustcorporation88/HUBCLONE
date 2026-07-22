import { prisma } from "@/lib/db";
import { formatBrl } from "@/lib/utils";

export type SendChannel = "EMAIL" | "WHATSAPP";

type ObligationWithClient = {
  id: string;
  firmId: string;
  type: string;
  competence: string;
  amountCents: number | null;
  dueAt: Date | null;
  status: string;
  client: {
    tradeName: string | null;
    legalName: string;
    email: string | null;
    whatsapp: string | null;
  };
};

function buildMessage(o: ObligationWithClient, firmName: string) {
  const clientName = o.client.tradeName ?? o.client.legalName;
  const due = o.dueAt
    ? o.dueAt.toLocaleDateString("pt-BR")
    : "a confirmar";
  return (
    `${firmName}: guia ${o.type} competência ${o.competence} ` +
    `de ${clientName} — valor ${formatBrl(o.amountCents)}, vencimento ${due}. ` +
    `Acesse o app do escritório para visualizar e pagar.`
  );
}

/**
 * Provider de envio. Hoje: mock (loga + gera msgId).
 * Depois: WhatsApp Cloud API / SMTP / Resend sem mudar a API pública.
 */
async function dispatch(channel: SendChannel, to: string, body: string) {
  const mode = process.env.DELIVERY_MODE ?? "mock";
  const msgId = `${channel.toLowerCase()}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  if (mode === "mock") {
    console.info(`[delivery:mock] ${channel} → ${to} | ${body.slice(0, 120)}…`);
    return { ok: true as const, providerMsgId: msgId };
  }

  // Hooks for real providers (not configured yet)
  if (channel === "WHATSAPP" && process.env.WHATSAPP_API_TOKEN) {
    // TODO: call Meta Cloud API
    return { ok: true as const, providerMsgId: msgId };
  }
  if (channel === "EMAIL" && process.env.SMTP_HOST) {
    // TODO: SMTP / Resend
    return { ok: true as const, providerMsgId: msgId };
  }

  return {
    ok: false as const,
    error: "Provider real não configurado (defina DELIVERY_MODE=mock ou tokens)",
  };
}

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
    return { error: `Guia em status ${obligation.status} não pode ser enviada`, status: 400 as const };
  }

  const body = buildMessage(obligation, opts.firmName);
  const results: Array<{
    channel: SendChannel;
    deliveryId: string;
    status: string;
    toAddress: string;
  }> = [];

  for (const channel of opts.channels) {
    const toAddress =
      channel === "EMAIL" ? obligation.client.email : obligation.client.whatsapp;

    if (!toAddress) {
      const failed = await prisma.delivery.create({
        data: {
          firmId: opts.firmId,
          obligationId: obligation.id,
          channel,
          toAddress: "",
          status: "FAILED",
          bodyPreview: body.slice(0, 280),
          errorMessage:
            channel === "EMAIL"
              ? "Cliente sem e-mail cadastrado"
              : "Cliente sem WhatsApp cadastrado",
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
        channel,
        toAddress,
        status: "QUEUED",
        bodyPreview: body.slice(0, 280),
      },
    });

    const dispatched = await dispatch(channel, toAddress, body);

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
  }

  const anySent = results.some((r) => r.status === "SENT");
  if (anySent) {
    await prisma.obligation.update({
      where: { id: obligation.id },
      data: {
        status: obligation.status === "VIEWED" ? "VIEWED" : "SENT",
        sentAt: new Date(),
      },
    });

    // Advance related pipeline GUIDE → PAY when sending guide
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
