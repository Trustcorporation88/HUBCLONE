import { prisma } from "@/lib/db";
import { gerarCodigo, hashCodigo } from "@/lib/invites";

/**
 * Redefinição de senha.
 *
 * Reaproveita o gerador e o hash dos convites de propósito: é o mesmo problema
 * — um segredo de uso único que viaja numa URL — e duas implementações do mesmo
 * primitivo é como uma delas envelhece pior que a outra.
 *
 * A validade aqui é bem mais curta que a do convite (1 hora contra 72). Convite
 * é agendado com uma pessoa; redefinição de senha é a operação mais atacada de
 * um app, e um link de longa validade parado numa caixa de e-mail é uma chave
 * esquecida na porta.
 */

const VALIDADE_MINUTOS = 60;

export { gerarCodigo, hashCodigo };

export function validadeReset(): Date {
  return new Date(Date.now() + VALIDADE_MINUTOS * 60 * 1000);
}

export function minutosDeValidade(): number {
  return VALIDADE_MINUTOS;
}

type Reset = {
  id: string;
  userId: string;
  expiresAt: Date;
  usedAt: Date | null;
};

/**
 * Emite um código novo e derruba os anteriores do mesmo usuário.
 *
 * Invalidar os antigos importa: sem isso, cada pedido de recuperação deixa mais
 * uma chave válida circulando, e quem pedir três vezes fica com três links
 * ativos — dois deles esquecidos em algum lugar.
 *
 * `emitidoPor` é "SELF" quando o próprio usuário pediu, ou o id de quem gerou
 * pelo painel.
 */
export async function emitirReset(opts: {
  userId: string;
  emitidoPor: string;
}): Promise<{ codigo: string; expiraEm: Date }> {
  const codigo = gerarCodigo();
  const expiraEm = validadeReset();

  await prisma.$transaction(async (tx) => {
    await tx.passwordReset.updateMany({
      where: { userId: opts.userId, usedAt: null },
      data: { usedAt: new Date() },
    });
    await tx.passwordReset.create({
      data: {
        codeHash: hashCodigo(codigo),
        userId: opts.userId,
        createdBy: opts.emitidoPor,
        expiresAt: expiraEm,
      },
    });
  });

  return { codigo, expiraEm };
}

/**
 * Carrega o pedido de redefinição pelo código e diz se ainda vale.
 *
 * Resposta deliberadamente pobre quando não vale: código inválido, expirado e
 * já usado devolvem a mesma mensagem, para a rota não virar oráculo de códigos.
 */
export async function carregarReset(
  codigo: string,
): Promise<{ ok: true; reset: Reset } | { ok: false; motivo: string }> {
  const codigoLimpo = (codigo ?? "").trim();
  if (!/^[a-f0-9]{32}$/i.test(codigoLimpo)) {
    return { ok: false, motivo: "Link inválido ou expirado." };
  }

  const reset = await prisma.passwordReset.findUnique({
    where: { codeHash: hashCodigo(codigoLimpo) },
    select: { id: true, userId: true, expiresAt: true, usedAt: true },
  });

  if (!reset || reset.usedAt || reset.expiresAt < new Date()) {
    return { ok: false, motivo: "Link inválido ou expirado." };
  }

  return { ok: true, reset };
}

/** True quando o servidor tem SMTP completo — mesma checagem do getOpsStatus. */
export function smtpConfigurado(): boolean {
  return Boolean(
    process.env.SMTP_HOST?.trim() &&
      process.env.SMTP_USER?.trim() &&
      process.env.SMTP_PASS?.trim() &&
      process.env.SMTP_FROM?.trim(),
  );
}

/**
 * Base absoluta para montar o link. Prefere o host canônico configurado; cai
 * para a origem da requisição quando ele não existe (dev/local).
 */
export function baseDoLink(req: Request): string {
  const canonico = process.env.CANONICAL_HOST?.trim()
    .replace(/^https?:\/\//, "")
    .replace(/\/$/, "");
  if (canonico) return `https://${canonico}`;
  try {
    return new URL(req.url).origin;
  } catch {
    return "";
  }
}
