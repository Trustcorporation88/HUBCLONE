import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  SESSION_COOKIE,
  createSessionToken,
  verifyPassword,
} from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { z } from "zod";

const bodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  firmSlug: z.string().min(1),
});

const INVALID_CREDS = "Escritório, e-mail ou senha inválidos";

export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });
  }

  const { email, password, firmSlug } = parsed.data;

  // Rate limit por escritório+e-mail para conter força bruta de senha.
  const rate = checkRateLimit(`login:${firmSlug}:${email.toLowerCase()}`, {
    limit: 8,
    windowMs: 5 * 60_000,
  });
  if (!rate.allowed) {
    return NextResponse.json(
      { error: "Muitas tentativas. Aguarde alguns minutos e tente novamente." },
      { status: 429, headers: { "Retry-After": String(Math.ceil(rate.retryAfterMs / 1000)) } },
    );
  }

  const firm = await prisma.firm.findUnique({ where: { slug: firmSlug } });
  const user = firm
    ? await prisma.user.findUnique({
        where: { firmId_email: { firmId: firm.id, email: email.toLowerCase() } },
      })
    : null;

  // Resposta genérica para escritório inexistente OU credenciais erradas —
  // não revela quais escritórios/e-mails existem (evita enumeração).
  if (!firm || !user || !(await verifyPassword(password, user.passwordHash))) {
    return NextResponse.json({ error: INVALID_CREDS }, { status: 401 });
  }

  const brandName = firm.brandName || firm.name;

  const token = await createSessionToken({
    userId: user.id,
    firmId: firm.id,
    clientId: user.clientId,
    email: user.email,
    name: user.name,
    role: user.role,
    firmSlug: firm.slug,
    firmName: firm.name,
    brandName,
  });

  const redirectTo = user.role === "CLIENT" ? "/portal" : "/app";

  const res = NextResponse.json({
    ok: true,
    redirectTo,
    user: {
      name: user.name,
      email: user.email,
      role: user.role,
      clientId: user.clientId,
    },
    firm: { name: firm.name, slug: firm.slug, brandName },
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
