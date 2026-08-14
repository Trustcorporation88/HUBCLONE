import { createHash, randomBytes } from "crypto";
import { prisma } from "@/lib/db";

/**
 * Convites de acesso ao OS.
 *
 * Duas naturezas, com poderes bem diferentes:
 *
 *  - JOIN_FIRM: adiciona uma pessoa a um escritório que já existe. Quem convida
 *    é OWNER ou MANAGER daquele escritório. É o caso de sócio e funcionário.
 *
 *  - NEW_FIRM: cria um escritório INDEPENDENTE, com dados isolados dos demais.
 *    Isso é hospedar outro contador na sua instância, então só o dono da
 *    plataforma pode emitir.
 *
 * Quem é o dono da plataforma: o OWNER do escritório mais antigo, o que nasceu
 * do /setup. Definido por ordem de criação em vez de flag no banco para não
 * exigir migração de dados numa base que já está em produção.
 */

const VALIDADE_HORAS = 72;

export function gerarCodigo(): string {
  // 32 hex = 128 bits. Vai na URL, então nada de caractere que precise escape.
  return randomBytes(16).toString("hex");
}

export function hashCodigo(codigo: string): string {
  return createHash("sha256").update(codigo.trim()).digest("hex");
}

export function validadePadrao(): Date {
  return new Date(Date.now() + VALIDADE_HORAS * 60 * 60 * 1000);
}

/** True se o usuário pertence ao escritório mais antigo e é OWNER dele. */
export async function ehDonoDaPlataforma(session: {
  userId: string;
  firmId: string;
  role: string;
}): Promise<boolean> {
  if (session.role !== "OWNER") return false;
  const primeiro = await prisma.firm.findFirst({
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  return primeiro?.id === session.firmId;
}

type Convite = {
  id: string;
  kind: string;
  firmId: string | null;
  role: string;
  email: string | null;
  expiresAt: Date;
  usedAt: Date | null;
};

/**
 * Carrega o convite pelo código e diz se ele ainda vale.
 *
 * Resposta deliberadamente pobre quando não vale: código inválido, expirado e
 * já usado devolvem a mesma mensagem, para não virar oráculo de códigos.
 */
export async function carregarConvite(
  codigo: string,
): Promise<
  { ok: true; convite: Convite } | { ok: false; motivo: string }
> {
  const codigoLimpo = (codigo ?? "").trim();
  if (!/^[a-f0-9]{32}$/i.test(codigoLimpo)) {
    return { ok: false, motivo: "Convite inválido ou expirado." };
  }

  const convite = await prisma.firmInvite.findUnique({
    where: { codeHash: hashCodigo(codigoLimpo) },
    select: {
      id: true,
      kind: true,
      firmId: true,
      role: true,
      email: true,
      expiresAt: true,
      usedAt: true,
    },
  });

  if (!convite || convite.usedAt || convite.expiresAt < new Date()) {
    return { ok: false, motivo: "Convite inválido ou expirado." };
  }

  return { ok: true, convite };
}
