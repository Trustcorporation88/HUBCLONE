import { prisma } from "@/lib/db";

export function entryRevenueCents(e: {
  minutes: number;
  hourlyRateCents: number;
  billable: boolean;
}) {
  if (!e.billable) return 0;
  return Math.round((e.minutes / 60) * e.hourlyRateCents);
}

export function entryCostCents(e: {
  minutes: number;
  costRateCents: number;
}) {
  return Math.round((e.minutes / 60) * e.costRateCents);
}

export async function getClientPnl(firmId: string, from?: Date, to?: Date) {
  const entries = await prisma.timeEntry.findMany({
    where: {
      firmId,
      ...(from || to
        ? {
            workedAt: {
              ...(from ? { gte: from } : {}),
              ...(to ? { lte: to } : {}),
            },
          }
        : {}),
    },
    include: {
      client: { select: { id: true, tradeName: true, legalName: true } },
      user: { select: { id: true, name: true } },
    },
    orderBy: { workedAt: "desc" },
  });

  const byClient = new Map<
    string,
    {
      clientId: string;
      clientName: string;
      minutes: number;
      revenueCents: number;
      costCents: number;
      marginCents: number;
    }
  >();

  for (const e of entries) {
    const revenue = entryRevenueCents(e);
    const cost = entryCostCents(e);
    const key = e.clientId;
    const existing = byClient.get(key);
    if (!existing) {
      byClient.set(key, {
        clientId: e.clientId,
        clientName: e.client.tradeName ?? e.client.legalName,
        minutes: e.minutes,
        revenueCents: revenue,
        costCents: cost,
        marginCents: revenue - cost,
      });
    } else {
      existing.minutes += e.minutes;
      existing.revenueCents += revenue;
      existing.costCents += cost;
      existing.marginCents = existing.revenueCents - existing.costCents;
    }
  }

  return {
    entries,
    byClient: Array.from(byClient.values()).sort(
      (a, b) => b.marginCents - a.marginCents,
    ),
  };
}
