import { prisma } from "@/lib/db";

export type SlaResult = {
  deliveryId: string;
  channel: string;
  status: string;
  hoursElapsed: number;
  targetHours: number;
  onTime: boolean | null;
  late: boolean;
};

export async function ensureDefaultSlaPolicies(firmId: string) {
  const defaults = [
    { channel: "EMAIL", department: "ALL", targetHours: 24 },
    { channel: "WHATSAPP", department: "ALL", targetHours: 4 },
  ];
  for (const d of defaults) {
    await prisma.slaPolicy.upsert({
      where: {
        firmId_channel_department: {
          firmId,
          channel: d.channel,
          department: d.department,
        },
      },
      create: { firmId, ...d },
      update: {},
    });
  }
}

export async function getSlaMonitor(firmId: string) {
  await ensureDefaultSlaPolicies(firmId);

  const [policies, deliveries] = await Promise.all([
    prisma.slaPolicy.findMany({ where: { firmId } }),
    prisma.delivery.findMany({
      where: { firmId },
      include: {
        obligation: {
          include: {
            client: { select: { tradeName: true, legalName: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
  ]);

  const policyMap = new Map(
    policies.map((p) => [`${p.channel}:${p.department}`, p.targetHours]),
  );

  const now = Date.now();
  const rows: Array<
    SlaResult & {
      toAddress: string;
      clientName: string;
      createdAt: Date;
      sentAt: Date | null;
    }
  > = [];

  for (const d of deliveries) {
    const channel = d.channel === "WHATSAPP_MANUAL" ? "WHATSAPP" : d.channel;
    const target =
      policyMap.get(`${channel}:ALL`) ??
      policyMap.get(`${d.channel}:ALL`) ??
      24;
    const start = d.sentAt ?? d.createdAt;
    const end =
      d.viewedAt ??
      (d.status === "FAILED" || d.status === "SENT" || d.status === "DELIVERED"
        ? d.sentAt ?? now
        : now);
    const endMs = end instanceof Date ? end.getTime() : Number(end);
    const hoursElapsed = (endMs - start.getTime()) / (1000 * 60 * 60);
    const terminal = ["SENT", "DELIVERED", "VIEWED", "FAILED"].includes(
      d.status,
    );
    const onTime = terminal ? hoursElapsed <= target : null;
    const late = hoursElapsed > target && !["VIEWED", "DELIVERED"].includes(d.status)
      ? true
      : terminal
        ? hoursElapsed > target
        : hoursElapsed > target;

    rows.push({
      deliveryId: d.id,
      channel: d.channel,
      status: d.status,
      hoursElapsed: Math.round(hoursElapsed * 10) / 10,
      targetHours: target,
      onTime,
      late,
      toAddress: d.toAddress,
      clientName:
        d.obligation.client.tradeName ?? d.obligation.client.legalName,
      createdAt: d.createdAt,
      sentAt: d.sentAt,
    });
  }

  const lateCount = rows.filter((r) => r.late).length;
  const onTimeCount = rows.filter((r) => r.onTime === true).length;

  return { policies, rows, lateCount, onTimeCount };
}
