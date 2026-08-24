import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { sendRealEmail } from "@/lib/email";
import { checkRateLimit } from "@/lib/rate-limit";
import {
  baseDoLink,
  emitirReset,
  minutosDeValidade,
  smtpConfigurado,
} from "@/lib/password-reset";

export const runtime = "nodejs";

const schema = z.object({
  slug: z.string().min(2).max(60),
  email: z.string().email(),
});

/**
 * Pedido de redefinição pelo próprio usuário.
 *
 * Rota pública, então duas defesas:
 *
 *  1. Resposta idêntica exista ou não a conta. Sem isso o endpoint viraria um
 *     verificador de e-mails cadastrados — dá para varrer uma lista e descobrir
 *     quem é cliente de quem.
 *  2. Rate limit por slug+e-mail, para não servir de máquina de spam contra a
 *     caixa de entrada de alguém.
 *
 * Quando o servidor não tem SMTP, dizemos isso claramente. Não é vazamento:
 * é estado do servidor, igual para todo mundo, e o silêncio deixaria o usuário
 * esperando um e-mail que nunca sai.
 */
export async function POST(req: Request) {
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });
  }

  const slug = parsed.data.slug.trim().toLowerCase();
  const email = parsed.data.email.trim().toLowerCase();

  const limite = checkRateLimit(`forgot:${slug}:${email}`, {
    limit: 5,
    windowMs: 15 * 60_000,
  });
  if (!limite.allowed) {
    return NextResponse.json(
      { error: "Muitas tentativas. Tente novamente em alguns minutos." },
      {
        status: 429,
        headers: { "Retry-After": String(Math.ceil(limite.retryAfterMs / 1000)) },
      },
    );
  }

  if (!smtpConfigurado()) {
    return NextResponse.json(
      {
        error:
          "Recuperação por e-mail não está configurada neste servidor. Peça um link de redefinição ao administrador do escritório.",
      },
      { status: 503 },
    );
  }

  const generico = NextResponse.json({
    ok: true,
    mensagem:
      "Se existir uma conta com esses dados, o link de redefinição foi enviado por e-mail.",
  });

  const firm = await prisma.firm.findUnique({
    where: { slug },
    select: { id: true, name: true, brandName: true },
  });
  if (!firm) return generico;

  const user = await prisma.user.findFirst({
    where: { firmId: firm.id, email },
    select: { id: true, name: true },
  });
  if (!user) return generico;

  const { codigo } = await emitirReset({
    userId: user.id,
    emitidoPor: "SELF",
  });
  const link = `${baseDoLink(req)}/recuperar/${codigo}`;
  const marca = firm.brandName || firm.name;

  try {
    await sendRealEmail({
      to: email,
      subject: `Redefinir senha — ${marca}`,
      text: [
        `Olá, ${user.name}.`,
        "",
        `Recebemos um pedido para redefinir sua senha em ${marca}.`,
        "",
        link,
        "",
        `O link vale ${minutosDeValidade()} minutos e pode ser usado uma única vez.`,
        "Se não foi você que pediu, ignore este e-mail — sua senha atual continua valendo.",
      ].join("\n"),
    });
  } catch {
    // O código já foi emitido e o e-mail falhou. Não contamos qual dos dois
    // aconteceu: a resposta segue genérica para não virar oráculo. O erro fica
    // visível nos logs do SMTP.
    return generico;
  }

  return generico;
}
