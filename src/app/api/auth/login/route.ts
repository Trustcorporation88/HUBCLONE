import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  SESSION_COOKIE,
  createSessionToken,
  verifyPassword,
} from "@/lib/auth";
import { z } from "zod";

const bodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  firmSlug: z.string().min(1).default("trust-demo"),
});

export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });
  }

  const { email, password, firmSlug } = parsed.data;
  const firm = await prisma.firm.findUnique({ where: { slug: firmSlug } });
  if (!firm) {
    return NextResponse.json({ error: "Escritório não encontrado" }, { status: 404 });
  }

  const user = await prisma.user.findUnique({
    where: { firmId_email: { firmId: firm.id, email: email.toLowerCase() } },
  });

  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    return NextResponse.json({ error: "E-mail ou senha inválidos" }, { status: 401 });
  }

  const token = await createSessionToken({
    userId: user.id,
    firmId: firm.id,
    email: user.email,
    name: user.name,
    role: user.role,
    firmSlug: firm.slug,
    firmName: firm.name,
  });

  const res = NextResponse.json({
    ok: true,
    user: { name: user.name, email: user.email, role: user.role },
    firm: { name: firm.name, slug: firm.slug },
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
