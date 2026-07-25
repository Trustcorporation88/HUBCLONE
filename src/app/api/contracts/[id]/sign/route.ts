import { mkdir, writeFile } from "fs/promises";
import { createHash } from "crypto";
import path from "path";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { readSession } from "@/lib/auth";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, ctx: Ctx) {
  const session = await readSession();
  if (!session) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const { id } = await ctx.params;
  const contract = await prisma.contract.findFirst({
    where: {
      id,
      firmId: session.firmId,
      ...(session.role === "CLIENT" && session.clientId
        ? { clientId: session.clientId }
        : {}),
    },
  });
  if (!contract) {
    return NextResponse.json({ error: "Contrato não encontrado" }, { status: 404 });
  }
  if (!["SENT", "DRAFT"].includes(contract.status)) {
    return NextResponse.json(
      { error: "Contrato já assinado ou rejeitado" },
      { status: 400 },
    );
  }

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json(
      { error: "Envie o PDF assinado (campo file)" },
      { status: 400 },
    );
  }

  const ext = (file.name.split(".").pop() || "pdf").toLowerCase();
  if (ext !== "pdf") {
    return NextResponse.json(
      { error: "Apenas PDF assinado é aceito" },
      { status: 400 },
    );
  }

  const buf = Buffer.from(await file.arrayBuffer());

  // Valida conteúdo real (magic bytes) — nome do arquivo é fornecido pelo
  // cliente e não garante que o conteúdo seja de fato um PDF.
  if (buf.length < 512 || buf.subarray(0, 5).toString("ascii") !== "%PDF-") {
    return NextResponse.json(
      { error: "O arquivo enviado não é um PDF válido." },
      { status: 400 },
    );
  }

  const dir = path.join(
    process.cwd(),
    "data",
    "signatures",
    session.firmId,
  );
  await mkdir(dir, { recursive: true });
  const filePath = path.join(dir, `${contract.id}.pdf`);
  await writeFile(filePath, buf);

  // Trilha de auditoria mínima: isto NÃO é uma assinatura eletrônica
  // qualificada (ICP-Brasil/ClickSign) — é upload manual de PDF assinado à
  // mão. O hash + IP + user-agent servem de prova do que foi de fato
  // enviado, caso a autenticidade seja questionada depois.
  const fileHash = createHash("sha256").update(buf).digest("hex");
  const forwardedFor = req.headers.get("x-forwarded-for");
  const signerIp = forwardedFor?.split(",")[0]?.trim() || null;
  const userAgent = req.headers.get("user-agent");

  const updated = await prisma.contract.update({
    where: { id: contract.id },
    data: {
      status: "SIGNED",
      signedPdfPath: filePath,
      signedFileHash: fileHash,
      signedByIp: signerIp,
      signedByUserAgent: userAgent,
      signedAt: new Date(),
    },
  });

  return NextResponse.json({ contract: updated });
}
