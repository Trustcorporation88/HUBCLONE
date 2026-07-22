import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import {
  SESSION_COOKIE,
  createSessionToken,
  hashPassword,
} from "@/lib/auth";
import { requireAuthSecret } from "@/lib/runtime";

const bodySchema = z.object({
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

/** Cria o primeiro escritório + owner. Bloqueado se já existir qualquer Firm. */
export async function POST(req: Request) {
  try {
    requireAuthSecret();
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "AUTH_SECRET inválido" },
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
  const passwordHash = await hashPassword(data.password);

  const firm = await prisma.firm.create({
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
