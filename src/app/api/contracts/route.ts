import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { readSession } from "@/lib/auth";

const createSchema = z.object({
  clientId: z.string().min(1),
  title: z.string().min(2).max(200),
  kind: z.enum(["CONTRACT", "OS"]).default("OS"),
  notes: z.string().max(1000).optional(),
});

export async function GET(req: Request) {
  const session = await readSession();
  if (!session) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const clientScope =
    session.role === "CLIENT" && session.clientId
      ? { clientId: session.clientId }
      : {};

  const contracts = await prisma.contract.findMany({
    where: { firmId: session.firmId, ...clientScope },
    include: {
      client: { select: { tradeName: true, legalName: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ contracts });
}

export async function POST(req: Request) {
  const session = await readSession();
  if (!session || session.role === "CLIENT") {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const json = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });
  }

  const client = await prisma.client.findFirst({
    where: { id: parsed.data.clientId, firmId: session.firmId },
  });
  if (!client) {
    return NextResponse.json({ error: "Cliente não encontrado" }, { status: 404 });
  }

  const contract = await prisma.contract.create({
    data: {
      firmId: session.firmId,
      clientId: parsed.data.clientId,
      title: parsed.data.title,
      kind: parsed.data.kind,
      notes: parsed.data.notes,
      status: "DRAFT",
    },
  });

  return NextResponse.json({ contract });
}
