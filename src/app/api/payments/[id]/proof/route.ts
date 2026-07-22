import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";
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

  try {
    const buf = await readFile(payment.proofPath);
    const ext = path.extname(payment.proofPath).toLowerCase();
    const type =
      ext === ".pdf"
        ? "application/pdf"
        : ext === ".png"
          ? "image/png"
          : ext === ".webp"
            ? "image/webp"
            : ext === ".jpg" || ext === ".jpeg"
              ? "image/jpeg"
              : "application/octet-stream";

    return new NextResponse(buf, {
      headers: {
        "Content-Type": type,
        "Content-Disposition": `inline; filename="comprovante-${payment.id}${ext}"`,
      },
    });
  } catch {
    return NextResponse.json({ error: "Arquivo de comprovante ausente" }, { status: 404 });
  }
}
