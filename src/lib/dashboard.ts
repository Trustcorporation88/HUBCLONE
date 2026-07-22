import { prisma } from "@/lib/db";

export const MONITOR_TYPES = [
  "PGDAS",
  "DAS",
  "DCTFWEB",
  "FGTS",
  "GPS",
  "DARF",
  "CND",
  "ISS",
  "GNRE",
  "OTHER",
] as const;

export type Traffic = "ok" | "pending" | "attention";

export type TypeBucket = {
  type: string;
  ok: number;
  pending: number;
  attention: number;
  total: number;
};

function trafficForObligation(o: {
  status: string;
  dueAt: Date | null;
}): Traffic {
  if (o.status === "PAID" || o.status === "CANCELLED") return "ok";
  if (o.status === "OVERDUE") return "attention";
  if (o.dueAt && o.dueAt.getTime() < Date.now()) return "attention";
  if (["DRAFT", "READY", "SENT", "VIEWED"].includes(o.status)) return "pending";
  return "pending";
}

export async function getOfficeDashboard(firmId: string) {
  const now = new Date();
  const in30 = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  const [
    clients,
    clientsActive,
    obligations,
    xmlTotal,
    xmlError,
    xmlWarning,
    xmlCaptured,
    certs,
    tasksOpen,
    tasksDone,
    tasksProgress,
    tasksTodo,
    pipelinesLive,
    deliveriesFailed,
    recentPipelines,
  ] = await Promise.all([
    prisma.client.count({ where: { firmId } }),
    prisma.client.count({ where: { firmId, active: true } }),
    prisma.obligation.findMany({
      where: { firmId },
      select: { type: true, status: true, dueAt: true },
    }),
    prisma.xmlDocument.count({ where: { firmId } }),
    prisma.xmlDocument.count({ where: { firmId, status: "ERROR" } }),
    prisma.xmlDocument.count({ where: { firmId, status: "WARNING" } }),
    prisma.xmlDocument.count({ where: { firmId, status: "CAPTURED" } }),
    prisma.certificate.findMany({
      where: { firmId, active: true },
      select: { id: true, label: true, validTo: true, cnpj: true },
    }),
    prisma.task.count({
      where: {
        firmId,
        status: { in: ["PENDING", "IN_PROGRESS", "BLOCKED"] },
      },
    }),
    prisma.task.count({ where: { firmId, status: "DONE" } }),
    prisma.task.count({ where: { firmId, status: "IN_PROGRESS" } }),
    prisma.task.count({ where: { firmId, status: "PENDING" } }),
    prisma.fiscalPipeline.count({
      where: {
        firmId,
        NOT: {
          AND: [{ stage: "CLOSE" }, { stageStatus: "DONE" }],
        },
      },
    }),
    prisma.delivery.count({
      where: { firmId, status: "FAILED" },
    }),
    prisma.fiscalPipeline.findMany({
      where: { firmId },
      include: { client: true },
      orderBy: { updatedAt: "desc" },
      take: 8,
    }),
  ]);

  const byType = new Map<string, TypeBucket>();
  for (const t of MONITOR_TYPES) {
    byType.set(t, { type: t, ok: 0, pending: 0, attention: 0, total: 0 });
  }

  let okAll = 0;
  let pendingAll = 0;
  let attentionAll = 0;

  for (const o of obligations) {
    const traffic = trafficForObligation(o);
    const key = MONITOR_TYPES.includes(o.type as (typeof MONITOR_TYPES)[number])
      ? o.type
      : "OTHER";
    const bucket = byType.get(key)!;
    bucket.total += 1;
    bucket[traffic] += 1;
    if (traffic === "ok") okAll += 1;
    else if (traffic === "pending") pendingAll += 1;
    else attentionAll += 1;
  }

  const pendencies = Array.from(byType.values()).filter((b) => b.total > 0);
  // Always show core HubStrom-like rows even at zero for empty offices
  const coreTypes = ["PGDAS", "DAS", "DCTFWEB", "FGTS", "CND"] as const;
  const monitorRows = coreTypes.map(
    (t) => byType.get(t) ?? { type: t, ok: 0, pending: 0, attention: 0, total: 0 },
  );
  for (const b of pendencies) {
    if (!coreTypes.includes(b.type as (typeof coreTypes)[number])) {
      monitorRows.push(b);
    }
  }

  let certOk = 0;
  let certExpiring = 0;
  let certAttention = 0;
  for (const c of certs) {
    if (!c.validTo) {
      certAttention += 1;
      continue;
    }
    if (c.validTo.getTime() < now.getTime()) certAttention += 1;
    else if (c.validTo.getTime() <= in30.getTime()) certExpiring += 1;
    else certOk += 1;
  }

  const maxBar = Math.max(
    1,
    ...monitorRows.map((r) => r.ok + r.pending + r.attention),
  );

  return {
    clients,
    clientsActive,
    xml: {
      total: xmlTotal,
      error: xmlError,
      warning: xmlWarning,
      queue: xmlCaptured,
      alerts: xmlError + xmlWarning,
    },
    certs: {
      total: certs.length,
      ok: certOk,
      expiring: certExpiring,
      attention: certAttention,
      list: certs.slice(0, 5),
    },
    tasks: {
      open: tasksOpen,
      done: tasksDone,
      progress: tasksProgress,
      todo: tasksTodo,
      total: tasksDone + tasksOpen,
    },
    obligations: {
      ok: okAll,
      pending: pendingAll,
      attention: attentionAll,
      total: obligations.length,
    },
    monitorRows,
    maxBar,
    pipelinesLive,
    deliveriesFailed,
    recentPipelines,
  };
}
