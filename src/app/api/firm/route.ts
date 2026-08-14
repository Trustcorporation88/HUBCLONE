import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireStaffSession } from "@/lib/auth";

export const runtime = "nodejs";

const schema = z.object({
  name: z.string().min(2).max(120),
  brandName: z.string().min(2).max(120).optional(),
  brandTagline: z.string().max(160).optional(),
});

export async function PATCH(req: Request) {
  const session = await requireStaffSession();
  if (session.role !== "OWNER") {
    return NextResponse.json(
      { error: "Apenas o OWNER pode alterar os dados do escritório." },
      { status: 403 },
    );
  }

  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });
  }

  // O slug NAO muda aqui de proposito: ele identifica o escritorio e trocar
  // depois quebra referencia. Nome e marca sao livres.
  await prisma.firm.update({
    where: { id: session.firmId },
    data: {
      name: parsed.data.name.trim(),
      brandName: parsed.data.brandName?.trim() || parsed.data.name.trim(),
      brandTagline: parsed.data.brandTagline?.trim() || null,
    },
  });

  // O nome vive dentro do token de sessao, entao so aparece atualizado no
  // proximo login. Avisamos em vez de deixar o usuario achar que nao salvou.
  return NextResponse.json({
    ok: true,
    aviso: "Salvo. O nome novo aparece por completo no próximo login.",
  });
}
