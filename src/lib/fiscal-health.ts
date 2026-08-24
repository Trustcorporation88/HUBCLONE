import { subDays, subMonths } from "date-fns";
import { prisma } from "@/lib/db";

const CERT_WARN_DAYS = 30;

export async function refreshFiscalHealth(opts: {
  firmId: string;
  clientId?: string;
}) {
  const clients = await prisma.client.findMany({
    where: {
      firmId: opts.firmId,
      active: true,
      ...(opts.clientId ? { id: opts.clientId } : {}),
    },
  });

  let created = 0;

  if (clients.length === 0) {
    return { clients: 0, alertsCreated: 0 };
  }

  const clientIds = clients.map((c) => c.id);
  const cnpjDigitsByClient = new Map(
    clients.map((c) => [c.id, c.cnpj.replace(/\D/g, "")]),
  );
  const cnpjDigits = Array.from(new Set(cnpjDigitsByClient.values()));

  await prisma.fiscalAlert.updateMany({
    where: {
      firmId: opts.firmId,
      clientId: { in: clientIds },
      resolvedAt: null,
    },
    data: { resolvedAt: new Date() },
  });

  const [allCerts, allOverdue, allCndOk, xmlErrorGroups] = await Promise.all([
    prisma.certificate.findMany({
      where: {
        firmId: opts.firmId,
        active: true,
        OR: [{ clientId: { in: clientIds } }, { cnpj: { in: cnpjDigits } }],
      },
    }),
    prisma.obligation.findMany({
      where: {
        firmId: opts.firmId,
        clientId: { in: clientIds },
        status: { notIn: ["PAID", "CANCELLED"] },
        dueAt: { lt: new Date() },
      },
    }),
    prisma.obligation.findMany({
      where: {
        firmId: opts.firmId,
        clientId: { in: clientIds },
        type: "CND",
        status: "PAID",
        paidAt: { gte: subDays(new Date(), 180) },
      },
      select: { clientId: true },
    }),
    prisma.xmlDocument.groupBy({
      by: ["clientId"],
      where: {
        firmId: opts.firmId,
        clientId: { in: clientIds },
        status: "ERROR",
      },
      _count: { _all: true },
    }),
  ]);

  const cndOkClientIds = new Set(allCndOk.map((o) => o.clientId));
  const xmlErrorsByClient = new Map(
    xmlErrorGroups.map((g) => [g.clientId, g._count._all]),
  );

  for (const client of clients) {
    const clientCnpjDigits = cnpjDigitsByClient.get(client.id)!;
    const certs = allCerts.filter(
      (c) => c.clientId === client.id || c.cnpj === clientCnpjDigits,
    );
    const overdue = allOverdue.filter((o) => o.clientId === client.id);
    const cndOk = cndOkClientIds.has(client.id);
    const xmlErrors = xmlErrorsByClient.get(client.id) ?? 0;

    const now = Date.now();
    for (const cert of certs) {
      if (!cert.validTo) continue;
      const days =
        (cert.validTo.getTime() - now) / (1000 * 60 * 60 * 24);
      if (days < 0) {
        await prisma.fiscalAlert.create({
          data: {
            firmId: opts.firmId,
            clientId: client.id,
            type: "CERT_EXPIRING",
            severity: "CRITICAL",
            message: `Certificado A1 expirado (${cert.label})`,
            metaJson: JSON.stringify({ certificateId: cert.id }),
          },
        });
        created += 1;
      } else if (days <= CERT_WARN_DAYS) {
        await prisma.fiscalAlert.create({
          data: {
            firmId: opts.firmId,
            clientId: client.id,
            type: "CERT_EXPIRING",
            severity: "WARNING",
            message: `Certificado A1 expira em ${Math.ceil(days)} dia(s) (${cert.label})`,
            metaJson: JSON.stringify({ certificateId: cert.id }),
          },
        });
        created += 1;
      }
    }

    if (certs.length === 0) {
      await prisma.fiscalAlert.create({
        data: {
          firmId: opts.firmId,
          clientId: client.id,
          type: "CERT_EXPIRING",
          severity: "WARNING",
          message: "Nenhum certificado A1 ativo cadastrado",
          metaJson: "{}",
        },
      });
      created += 1;
    }

    if (!cndOk) {
      await prisma.fiscalAlert.create({
        data: {
          firmId: opts.firmId,
          clientId: client.id,
          type: "CND_MISSING",
          severity: "WARNING",
          message: "Sem CND paga nos últimos 180 dias (registre a obrigação CND)",
          metaJson: "{}",
        },
      });
      created += 1;
    }

    for (const o of overdue) {
      await prisma.fiscalAlert.create({
        data: {
          firmId: opts.firmId,
          clientId: client.id,
          type: "OVERDUE",
          severity: "CRITICAL",
          message: `Guia ${o.type} ${o.competence} vencida`,
          metaJson: JSON.stringify({ obligationId: o.id }),
        },
      });
      created += 1;
    }

    if (xmlErrors > 0) {
      await prisma.fiscalAlert.create({
        data: {
          firmId: opts.firmId,
          clientId: client.id,
          type: "XML_ERROR",
          severity: "CRITICAL",
          message: `${xmlErrors} XML(s) com inconsistência bloqueante`,
          metaJson: JSON.stringify({ count: xmlErrors }),
        },
      });
      created += 1;
    }
  }

  return { clients: clients.length, alertsCreated: created };
}

export async function getAdvisorySummary(opts: {
  firmId: string;
  clientId: string;
  months?: number;
}) {
  const months = opts.months ?? 6;
  const from = subMonths(new Date(), months);

  const [xmlOut, obligations] = await Promise.all([
    prisma.xmlDocument.findMany({
      where: {
        firmId: opts.firmId,
        clientId: opts.clientId,
        direction: "OUT",
        issuedAt: { gte: from },
      },
    }),
    prisma.obligation.findMany({
      where: {
        firmId: opts.firmId,
        clientId: opts.clientId,
        createdAt: { gte: from },
      },
    }),
  ]);

  const revenueCents = xmlOut.reduce((s, d) => s + (d.amountCents ?? 0), 0);
  const taxCents = obligations.reduce((s, o) => s + (o.amountCents ?? 0), 0);
  const paidCents = obligations
    .filter((o) => o.status === "PAID")
    .reduce((s, o) => s + (o.amountCents ?? 0), 0);
  const openCents = obligations
    .filter((o) => !["PAID", "CANCELLED"].includes(o.status))
    .reduce((s, o) => s + (o.amountCents ?? 0), 0);

  return {
    months,
    from,
    revenueCents,
    taxCents,
    paidCents,
    openCents,
    xmlCount: xmlOut.length,
    obligationCount: obligations.length,
  };
}
