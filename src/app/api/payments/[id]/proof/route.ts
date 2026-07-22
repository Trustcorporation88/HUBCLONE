import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import { readSession } from "@/lib/auth";
import { prisma } from "@/lib/db";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const session = await readSession();
  if (!session) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const { id } = await ctx.params;
  const payment = await prisma.payment.findFirst({
    where: { id, firmId: session.firmId },
  });

  if (!payment?.proofPath) {
    return NextResponse.json({ error: "Comprovante não disponível" }, { status: 404 });
  }

  try {
    const content = await readFile(payment.proofPath, "utf8");
    return new NextResponse(content, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Content-Disposition": `inline; filename="comprovante-${payment.id}.txt"`,
      },
    });
  } catch {
    return NextResponse.json({ error: "Arquivo de comprovante ausente" }, { status: 404 });
  }
}
