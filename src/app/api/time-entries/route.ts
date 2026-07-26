import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { readSession } from "@/lib/auth";

/** Verifica se é sócio/gerente (dados financeiros sensiveis). */
function isAdmin(role: string) {
  return role === "OWNER" || role === "MANAGER";
}

const bodySchema = z.object({
  clientId: z.string().min(1),
  taskId: z.string().optional(),
  minutes: z.number().int().positive().max(24 * 60),
  hourlyRateCents: z.number().int().min(0),
  costRateCents: z.number().int().min(0).default(0),
  billable: z.boolean().default(true),
  note: z.string().max(500).optional(),
  workedAt: z.string().datetime().optional(),
});

export async function GET(req: Request) {
  const session = await readSession();
  if (!session || session.role === "CLIENT") {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const clientId = new URL(req.url).searchParams.get("clientId");
  const entries = await prisma.timeEntry.findMany({
    where: {
      firmId: session.firmId,
      ...(clientId ? { clientId } : {}),
    },
    include: {
      client: { select: { tradeName: true, legalName: true } },
      user: { select: { name: true } },
    },
    orderBy: { workedAt: "desc" },
    take: 200,
  });

  // STAFF vê apenas os próprios lançamentos sem dados de custo/valor
  // (P&L interno: apenas OWNER/MANAGER).
  const admin = isAdmin(session.role);
  const safe = entries.map((e) => ({
    ...e,
    hourlyRateCents: admin ? e.hourlyRateCents : undefined,
    costRateCents: admin ? e.costRateCents : undefined,
  }));

  return NextResponse.json({ entries: safe });
}

export async function POST(req: Request) {
  const session = await readSession();
  if (!session || session.role === "CLIENT") {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });
  }

  const client = await prisma.client.findFirst({
    where: { id: parsed.data.clientId, firmId: session.firmId },
  });
  if (!client) {
    return NextResponse.json({ error: "Cliente não encontrado" }, { status: 404 });
  }

  const entry = await prisma.timeEntry.create({
    data: {
      firmId: session.firmId,
      clientId: parsed.data.clientId,
      userId: session.userId,
      taskId: parsed.data.taskId,
      minutes: parsed.data.minutes,
      hourlyRateCents: parsed.data.hourlyRateCents,
      costRateCents: parsed.data.costRateCents,
      billable: parsed.data.billable,
      note: parsed.data.note,
      workedAt: parsed.data.workedAt
        ? new Date(parsed.data.workedAt)
        : new Date(),
    },
  });

  return NextResponse.json({ entry });
}
