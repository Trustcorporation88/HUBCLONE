import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireStaffSession } from "@/lib/auth";
import { emitirReset, minutosDeValidade } from "@/lib/password-reset";

export const runtime = "nodejs";

const schema = z.object({
  userId: z.string().min(1),
});

/**
 * Link de redefinição emitido pelo painel, por OWNER ou MANAGER do escritório.
 *
 * Este é o caminho que funciona **sem SMTP**, e é por isso que ele existe: até
 * aqui, esquecer a senha era perder o acesso, e a única saída era um convite
 * novo — que cria um escritório NOVO, deixando os dados do antigo órfãos. Perder
 * a senha equivalia a perder os dados.
 *
 * O código aparece UMA vez na resposta, como no convite. Quem emitiu entrega
 * por fora (WhatsApp, telefone, pessoalmente) e o banco fica só com o hash.
 */
export async function POST(req: Request) {
  const session = await requireStaffSession();

  if (session.role !== "OWNER" && session.role !== "MANAGER") {
    return NextResponse.json(
      { error: "Apenas OWNER ou MANAGER podem emitir redefinição de senha." },
      { status: 403 },
    );
  }

  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });
  }

  // Escopo por firmId: um OWNER não redefine senha de usuário de outro
  // escritório, nem quando adivinha o id.
  const alvo = await prisma.user.findFirst({
    where: { id: parsed.data.userId, firmId: session.firmId },
    select: { id: true, name: true, email: true, role: true },
  });
  if (!alvo) {
    return NextResponse.json(
      { error: "Usuário não encontrado neste escritório." },
      { status: 404 },
    );
  }

  const { codigo, expiraEm } = await emitirReset({
    userId: alvo.id,
    emitidoPor: session.userId,
  });

  return NextResponse.json({
    codigo,
    caminho: `/recuperar/${codigo}`,
    expiraEm: expiraEm.toISOString(),
    validadeMinutos: minutosDeValidade(),
    usuario: { nome: alvo.name, email: alvo.email, role: alvo.role },
  });
}
