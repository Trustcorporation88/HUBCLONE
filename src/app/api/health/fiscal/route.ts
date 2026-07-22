import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { readSession } from "@/lib/auth";
import { refreshFiscalHealth } from "@/lib/fiscal-health";

export async function GET(req: Request) {
  const session = await readSession();
  if (!session) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const url = new URL(req.url);
  const clientIdParam = url.searchParams.get("clientId");
  const clientId =
    session.role === "CLIENT" ? session.clientId : clientIdParam;

  const alerts = await prisma.fiscalAlert.findMany({
    where: {
      firmId: session.firmId,
      resolvedAt: null,
      ...(clientId ? { clientId } : {}),
    },
    include: {
      client: { select: { tradeName: true, legalName: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  return NextResponse.json({ alerts });
}

const refreshSchema = z.object({
  clientId: z.string().optional(),
});

export async function POST(req: Request) {
  const session = await readSession();
  if (!session) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const json = await req.json().catch(() => ({}));
  const parsed = refreshSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });
  }

  const clientId =
    session.role === "CLIENT"
      ? session.clientId ?? undefined
      : parsed.data.clientId;

  const result = await refreshFiscalHealth({
    firmId: session.firmId,
    clientId,
  });

  return NextResponse.json(result);
}
