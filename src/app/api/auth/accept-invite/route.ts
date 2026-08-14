import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { createSessionToken, hashPassword } from "@/lib/auth";
import { carregarConvite, hashCodigo } from "@/lib/invites";
import { checkRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

const schema = z.object({
  codigo: z.string().min(32).max(64),
  nome: z.string().min(2).max(120),
  email: z.string().email(),
  senha: z.string().min(10, "A senha precisa de pelo menos 10 caracteres"),
  // Só em NEW_FIRM
  nomeEscritorio: z.string().min(2).max(120).optional(),
});

function slugificar(valor: string): string {
  return valor
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Dados inválidos" },
      { status: 400 },
    );
  }
  const { codigo, nome, email, senha, nomeEscritorio } = parsed.data;
  const emailLimpo = email.trim().toLowerCase();

  // Rota pública: limita tentativa de adivinhar código por força bruta.
  const limite = checkRateLimit(`accept-invite:${emailLimpo}`, {
    limit: 10,
    windowMs: 15 * 60_000,
  });
  if (!limite.allowed) {
    return NextResponse.json(
      { error: "Muitas tentativas. Tente novamente em alguns minutos." },
      { status: 429 },
    );
  }

  const resultado = await carregarConvite(codigo);
  if (!resultado.ok) {
    return NextResponse.json({ error: resultado.motivo }, { status: 400 });
  }
  const convite = resultado.convite;

  if (convite.email && convite.email.toLowerCase() !== emailLimpo) {
    return NextResponse.json(
      { error: "Este convite foi emitido para outro e-mail." },
      { status: 403 },
    );
  }

  if (convite.kind === "NEW_FIRM" && !nomeEscritorio) {
    return NextResponse.json(
      { error: "Informe o nome do escritório." },
      { status: 400 },
    );
  }

  const passwordHash = await hashPassword(senha);

  try {
    const criado = await prisma.$transaction(async (tx) => {
      // Consome o convite ANTES de criar qualquer coisa. O update é condicionado
      // a usedAt nulo, então duas requisições simultâneas com o mesmo código só
      // deixam uma passar — sem isso, um link vazado viraria vários escritórios.
      const consumo = await tx.firmInvite.updateMany({
        where: { codeHash: hashCodigo(codigo.trim()), usedAt: null },
        data: { usedAt: new Date() },
      });
      if (consumo.count === 0) throw new Error("CONVITE_JA_USADO");

      let firmId = convite.firmId;

      if (convite.kind === "NEW_FIRM") {
        const base = slugificar(nomeEscritorio!);
        let slug = base || "escritorio";
        // Slug é único: se colidir, acrescenta sufixo em vez de estourar.
        for (let i = 2; i < 50; i += 1) {
          const existe = await tx.firm.findUnique({ where: { slug } });
          if (!existe) break;
          slug = `${base}-${i}`;
        }
        const firm = await tx.firm.create({
          data: {
            name: nomeEscritorio!,
            slug,
            brandName: nomeEscritorio!,
          },
        });
        firmId = firm.id;
      }

      if (!firmId) throw new Error("CONVITE_SEM_ESCRITORIO");

      const jaExiste = await tx.user.findFirst({
        where: { firmId, email: emailLimpo },
        select: { id: true },
      });
      if (jaExiste) throw new Error("EMAIL_EM_USO");

      const user = await tx.user.create({
        data: {
          firmId,
          email: emailLimpo,
          name: nome.trim(),
          passwordHash,
          role: convite.kind === "NEW_FIRM" ? "OWNER" : convite.role,
        },
      });

      await tx.firmInvite.update({
        where: { id: convite.id },
        data: { usedBy: user.id, firmId },
      });

      const firm = await tx.firm.findUniqueOrThrow({
        where: { id: firmId },
        select: { slug: true, name: true, brandName: true },
      });

      return { user, firmId, firm };
    });

    const token = await createSessionToken({
      userId: criado.user.id,
      firmId: criado.firmId,
      clientId: null,
      email: criado.user.email,
      name: criado.user.name,
      role: criado.user.role,
      firmSlug: criado.firm.slug,
      firmName: criado.firm.name,
      brandName: criado.firm.brandName ?? criado.firm.name,
    });

    const res = NextResponse.json({ ok: true, destino: "/app" });
    res.cookies.set("hub_session", token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
    });
    return res;
  } catch (e) {
    const codigoErro = e instanceof Error ? e.message : "";
    if (codigoErro === "EMAIL_EM_USO") {
      return NextResponse.json(
        { error: "Já existe usuário com esse e-mail neste escritório." },
        { status: 409 },
      );
    }
    if (codigoErro === "CONVITE_JA_USADO") {
      return NextResponse.json(
        { error: "Convite inválido ou expirado." },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { error: "Não foi possível concluir o cadastro." },
      { status: 500 },
    );
  }
}
