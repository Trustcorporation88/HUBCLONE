import { NextResponse } from "next/server";
import { z } from "zod";
import { createHash, timingSafeEqual } from "crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  SESSION_COOKIE,
  createSessionToken,
  hashPassword,
} from "@/lib/auth";
import { requireAuthSecret } from "@/lib/runtime";

/** Comparação em tempo constante (evita timing attack no token de instalação). */
function tokensMatch(a: string, b: string): boolean {
  // Hash antes de comparar: normaliza o tamanho (timingSafeEqual exige buffers
  // de mesmo comprimento) sem vazar o tamanho do segredo.
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

const bodySchema = z.object({
  bootstrapToken: z.string().min(1),
  firmName: z.string().min(2).max(120),
  firmSlug: z
    .string()
    .min(2)
    .max(60)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug inválido (use a-z, 0-9 e hífen)"),
  brandName: z.string().min(2).max(120).optional(),
  ownerName: z.string().min(2).max(120),
  ownerEmail: z.string().email(),
  password: z.string().min(8).max(128),
});

/**
 * Cria o primeiro escritório + owner. Bloqueado se já existir qualquer Firm.
 *
 * Este endpoint fica acessível publicamente (é o /setup inicial), então SEM
 * um token de instalação qualquer visitante que chegasse primeiro viraria o
 * dono permanente do sistema. BOOTSTRAP_TOKEN deve ser definido no .env do
 * servidor e informado apenas por quem tem acesso à infraestrutura.
 */
export async function POST(req: Request) {
  try {
    requireAuthSecret();
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "AUTH_SECRET inválido" },
      { status: 503 },
    );
  }

  const expectedToken = process.env.BOOTSTRAP_TOKEN?.trim();
  if (!expectedToken) {
    return NextResponse.json(
      {
        error:
          "BOOTSTRAP_TOKEN não configurado no servidor. Defina no .env antes de criar o primeiro escritório.",
      },
      { status: 503 },
    );
  }

  const count = await prisma.firm.count();
  if (count > 0) {
    return NextResponse.json(
      { error: "Já existe escritório cadastrado. Use o login." },
      { status: 409 },
    );
  }

  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Dados inválidos", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const data = parsed.data;
  if (!tokensMatch(data.bootstrapToken, expectedToken)) {
    return NextResponse.json(
      { error: "Token de instalação inválido." },
      { status: 403 },
    );
  }

  const passwordHash = await hashPassword(data.password);

  let firm;
  try {
    // Isolamento Serializable: fecha a corrida entre duas requisições
    // concorrentes de bootstrap — só uma vence, a outra recebe erro claro
    // em vez de criar um segundo escritório "OWNER".
    firm = await prisma.$transaction(
      async (tx) => {
        const current = await tx.firm.count();
        if (current > 0) {
          throw new Error("ALREADY_BOOTSTRAPPED");
        }
        return tx.firm.create({
          data: {
            name: data.firmName,
            slug: data.firmSlug,
            brandName: data.brandName ?? data.firmName,
            users: {
              create: {
                email: data.ownerEmail.toLowerCase(),
                name: data.ownerName,
                role: "OWNER",
                passwordHash,
              },
            },
          },
          include: { users: true },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  } catch (e) {
    if (e instanceof Error && e.message === "ALREADY_BOOTSTRAPPED") {
      return NextResponse.json(
        { error: "Já existe escritório cadastrado. Use o login." },
        { status: 409 },
      );
    }
    return NextResponse.json(
      { error: "Não foi possível criar o escritório. Tente novamente." },
      { status: 500 },
    );
  }

  const owner = firm.users[0]!;
  const brandName = firm.brandName || firm.name;

  const token = await createSessionToken({
    userId: owner.id,
    firmId: firm.id,
    clientId: null,
    email: owner.email,
    name: owner.name,
    role: owner.role,
    firmSlug: firm.slug,
    firmName: firm.name,
    brandName,
  });

  const res = NextResponse.json({
    ok: true,
    redirectTo: "/app",
    firm: { slug: firm.slug, name: firm.name },
  });

  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });

  return res;
}

export async function GET() {
  const count = await prisma.firm.count();
  return NextResponse.json({ needsBootstrap: count === 0 });
}
