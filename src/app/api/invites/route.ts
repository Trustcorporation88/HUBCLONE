import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireStaffSession } from "@/lib/auth";
import {
  ehDonoDaPlataforma,
  gerarCodigo,
  hashCodigo,
  validadePadrao,
} from "@/lib/invites";

export const runtime = "nodejs";

const schema = z.object({
  kind: z.enum(["NEW_FIRM", "JOIN_FIRM"]),
  role: z.enum(["OWNER", "MANAGER", "STAFF"]).default("OWNER"),
  email: z.string().email().optional(),
});

export async function GET() {
  const session = await requireStaffSession();

  // Dono da plataforma vê também os convites de escritório novo que emitiu.
  const dono = await ehDonoDaPlataforma(session);
  const convites = await prisma.firmInvite.findMany({
    where: dono
      ? { OR: [{ firmId: session.firmId }, { kind: "NEW_FIRM" }] }
      : { firmId: session.firmId },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      id: true,
      kind: true,
      role: true,
      email: true,
      expiresAt: true,
      usedAt: true,
      createdAt: true,
    },
  });

  return NextResponse.json({ convites, podeConvidarEscritorio: dono });
}

export async function POST(req: Request) {
  const session = await requireStaffSession();
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });
  }
  const { kind, role, email } = parsed.data;

  if (kind === "NEW_FIRM") {
    // Escritório novo é dado isolado de terceiro dentro da sua instância.
    if (!(await ehDonoDaPlataforma(session))) {
      return NextResponse.json(
        { error: "Só o dono da plataforma pode convidar um escritório novo." },
        { status: 403 },
      );
    }
  } else if (session.role !== "OWNER" && session.role !== "MANAGER") {
    return NextResponse.json(
      { error: "Apenas OWNER ou MANAGER podem convidar." },
      { status: 403 },
    );
  }

  const codigo = gerarCodigo();
  await prisma.firmInvite.create({
    data: {
      codeHash: hashCodigo(codigo),
      kind,
      // NEW_FIRM nasce sem escritório: ele é criado no aceite.
      firmId: kind === "JOIN_FIRM" ? session.firmId : null,
      role: kind === "NEW_FIRM" ? "OWNER" : role,
      email: email ?? null,
      createdBy: session.userId,
      expiresAt: validadePadrao(),
    },
  });

  // O código aparece UMA vez. Só o hash fica gravado.
  return NextResponse.json({
    codigo,
    caminho: `/convite/${codigo}`,
    expiraEm: validadePadrao().toISOString(),
  });
}
