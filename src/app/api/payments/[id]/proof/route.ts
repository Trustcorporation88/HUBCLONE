import { NextResponse } from "next/server";
import { readSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { contentTypeForPointer, readStoredFile } from "@/lib/storage";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const session = await readSession();
  if (!session) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const { id } = await ctx.params;
  const payment = await prisma.payment.findFirst({
    where: {
      id,
      firmId: session.firmId,
      ...(session.role === "CLIENT" && session.clientId
        ? { obligation: { clientId: session.clientId } }
        : {}),
    },
  });

  if (!payment?.proofPath) {
    return NextResponse.json({ error: "Comprovante não disponível" }, { status: 404 });
  }

  // proofPath é um pointer: chave do bucket nos registros novos, caminho local
  // absoluto nos antigos. readStoredFile resolve os dois.
  try {
    const buf = await readStoredFile(payment.proofPath);
    const type = contentTypeForPointer(payment.proofPath);
    const ext = payment.proofPath.includes(".")
      ? `.${payment.proofPath.split(".").pop()}`
      : "";

    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type": type,
        "Content-Disposition": `inline; filename="comprovante-${payment.id}${ext}"`,
      },
    });
  } catch {
    return NextResponse.json({ error: "Arquivo de comprovante ausente" }, { status: 404 });
  }
}
