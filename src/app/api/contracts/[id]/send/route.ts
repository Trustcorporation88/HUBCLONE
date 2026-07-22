import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { readSession } from "@/lib/auth";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(_req: Request, ctx: Ctx) {
  const session = await readSession();
  if (!session || session.role === "CLIENT") {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const { id } = await ctx.params;
  const contract = await prisma.contract.findFirst({
    where: { id, firmId: session.firmId },
  });
  if (!contract) {
    return NextResponse.json({ error: "Contrato não encontrado" }, { status: 404 });
  }

  const updated = await prisma.contract.update({
    where: { id },
    data: { status: "SENT", sentAt: new Date() },
  });

  return NextResponse.json({ contract: updated });
}
