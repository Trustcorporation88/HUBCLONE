import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { readSession } from "@/lib/auth";
import { ensureDefaultSlaPolicies } from "@/lib/sla";

const bodySchema = z.object({
  channel: z.enum(["EMAIL", "WHATSAPP"]),
  department: z.string().default("ALL"),
  targetHours: z.number().int().positive().max(720),
});

export async function GET() {
  const session = await readSession();
  if (!session || session.role === "CLIENT") {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }
  await ensureDefaultSlaPolicies(session.firmId);
  const policies = await prisma.slaPolicy.findMany({
    where: { firmId: session.firmId },
  });
  return NextResponse.json({ policies });
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

  const policy = await prisma.slaPolicy.upsert({
    where: {
      firmId_channel_department: {
        firmId: session.firmId,
        channel: parsed.data.channel,
        department: parsed.data.department,
      },
    },
    create: {
      firmId: session.firmId,
      channel: parsed.data.channel,
      department: parsed.data.department,
      targetHours: parsed.data.targetHours,
    },
    update: { targetHours: parsed.data.targetHours },
  });

  return NextResponse.json({ policy });
}
