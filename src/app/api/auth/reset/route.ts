import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { SESSION_COOKIE, createSessionToken, hashPassword } from "@/lib/auth";
import { carregarReset, hashCodigo } from "@/lib/password-reset";
import { checkRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

const schema = z.object({
  codigo: z.string().min(32).max(64),
  senha: z.string().min(10, "A senha precisa de pelo menos 10 caracteres"),
});

export async function POST(req: Request) {
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Dados inválidos" },
      { status: 400 },
    );
  }
  const { codigo, senha } = parsed.data;
  const codigoLimpo = codigo.trim();

  // Rota pública: limita força bruta sobre o espaço de códigos. A chave é o
  // próprio código, então tentar mil códigos diferentes não gasta a cota de um
  // usuário legítimo — mas repetir o mesmo código, sim.
  const limite = checkRateLimit(`reset:${codigoLimpo.slice(0, 12)}`, {
    limit: 10,
    windowMs: 15 * 60_000,
  });
  if (!limite.allowed) {
    return NextResponse.json(
      { error: "Muitas tentativas. Tente novamente em alguns minutos." },
      { status: 429 },
    );
  }

  const resultado = await carregarReset(codigoLimpo);
  if (!resultado.ok) {
    return NextResponse.json({ error: resultado.motivo }, { status: 400 });
  }

  const passwordHash = await hashPassword(senha);

  try {
    const atualizado = await prisma.$transaction(async (tx) => {
      // Consome ANTES de trocar a senha, condicionado a usedAt nulo: duas
      // requisições simultâneas com o mesmo código só deixam uma passar.
      const consumo = await tx.passwordReset.updateMany({
        where: { codeHash: hashCodigo(codigoLimpo), usedAt: null },
        data: { usedAt: new Date() },
      });
      if (consumo.count === 0) throw new Error("LINK_JA_USADO");

      const user = await tx.user.update({
        where: { id: resultado.reset.userId },
        data: { passwordHash },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          clientId: true,
          firmId: true,
        },
      });

      // Qualquer outro link pendente do mesmo usuário morre aqui. Trocar a senha
      // é justamente o momento de invalidar o que estava em trânsito.
      await tx.passwordReset.updateMany({
        where: { userId: user.id, usedAt: null },
        data: { usedAt: new Date() },
      });

      const firm = await tx.firm.findUniqueOrThrow({
        where: { id: user.firmId },
        select: { slug: true, name: true, brandName: true },
      });

      return { user, firm };
    });

    const { user, firm } = atualizado;

    const token = await createSessionToken({
      userId: user.id,
      firmId: user.firmId,
      clientId: user.clientId,
      email: user.email,
      name: user.name,
      role: user.role,
      firmSlug: firm.slug,
      firmName: firm.name,
      brandName: firm.brandName ?? firm.name,
    });

    const res = NextResponse.json({ ok: true, destino: "/app" });
    res.cookies.set(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
    });
    return res;
  } catch (e) {
    if (e instanceof Error && e.message === "LINK_JA_USADO") {
      return NextResponse.json(
        { error: "Link inválido ou expirado." },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { error: "Não foi possível redefinir a senha." },
      { status: 500 },
    );
  }
}
