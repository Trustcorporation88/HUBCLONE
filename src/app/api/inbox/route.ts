import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { readSession } from "@/lib/auth";
import { classifyInboxWithOpenAI } from "@/lib/openai-classify";
import { resolveOpenAiKey } from "@/lib/openai-key";
import { checkRateLimit } from "@/lib/rate-limit";

async function extractTextFromPdf(buffer: Buffer): Promise<string | undefined> {
  try {
    const pdfParse = (await import("pdf-parse")).default;
    const result = await pdfParse(buffer);
    return result.text?.trim() || undefined;
  } catch {
    return undefined;
  }
}

export async function GET() {
  const session = await readSession();
  if (!session) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const clientScope =
    session.role === "CLIENT" && session.clientId
      ? { clientId: session.clientId }
      : {};

  const items = await prisma.inboxItem.findMany({
    where: { firmId: session.firmId, ...clientScope },
    include: {
      client: { select: { tradeName: true, legalName: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return NextResponse.json({ items });
}

export async function POST(req: Request) {
  const session = await readSession();
  if (!session) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const rate = checkRateLimit(`inbox:${session.userId}`, { limit: 15, windowMs: 60_000 });
  if (!rate.allowed) {
    return NextResponse.json(
      { error: "Muitos envios. Aguarde um instante e tente novamente." },
      { status: 429, headers: { "Retry-After": String(Math.ceil(rate.retryAfterMs / 1000)) } },
    );
  }

  const form = await req.formData();
  const file = form.get("file");
  let clientId = String(form.get("clientId") ?? "");

  if (session.role === "CLIENT") {
    if (!session.clientId) {
      return NextResponse.json({ error: "Cliente inválido" }, { status: 403 });
    }
    clientId = session.clientId;
  }

  if (!clientId) {
    return NextResponse.json({ error: "clientId obrigatório" }, { status: 400 });
  }

  const client = await prisma.client.findFirst({
    where: { id: clientId, firmId: session.firmId },
  });
  if (!client) {
    return NextResponse.json({ error: "Cliente não encontrado" }, { status: 404 });
  }

  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "Arquivo obrigatório" }, { status: 400 });
  }

  const allowed = [
    "application/pdf",
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/jpg",
  ];
  if (!allowed.includes(file.type) && !/\.(pdf|jpe?g|png|webp)$/i.test(file.name)) {
    return NextResponse.json(
      { error: "Envie PDF, JPG ou PNG" },
      { status: 400 },
    );
  }

  const dir = path.join(process.cwd(), "data", "inbox", session.firmId, clientId);
  await mkdir(dir, { recursive: true });
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120);
  const filePath = path.join(dir, `${Date.now()}-${safeName}`);
  const buf = Buffer.from(await file.arrayBuffer());
  await writeFile(filePath, buf);

  let classification: string | null = null;
  let confidence: number | null = null;
  let rawAiJson: string | null = null;
  let status = "PENDING";
  let note: string | null = null;

  try {
    const apiKey = await resolveOpenAiKey(session.firmId);
    const mimeType = file.type || "application/octet-stream";
    const isImage = mimeType.startsWith("image/");
    const isPdf = mimeType === "application/pdf" || /\.pdf$/i.test(file.name);

    const textExcerpt = isPdf ? await extractTextFromPdf(buf) : undefined;
    // Só envia a imagem em base64 se não conseguimos extrair texto (evita
    // gastar tokens de visão quando o PDF já tem texto suficiente).
    const imageBase64 = isImage && !textExcerpt ? buf.toString("base64") : undefined;

    const result = await classifyInboxWithOpenAI({
      filename: file.name,
      mimeType,
      textExcerpt,
      imageBase64,
      apiKey,
    });
    classification = result.classification;
    confidence = result.confidence;
    rawAiJson = JSON.stringify(result.raw);
    status = "CLASSIFIED";
    note = result.summary;
  } catch (e) {
    return NextResponse.json(
      {
        error:
          e instanceof Error
            ? e.message
            : "Falha ao classificar com OpenAI. Configure OPENAI_API_KEY.",
      },
      { status: 502 },
    );
  }

  const item = await prisma.inboxItem.create({
    data: {
      firmId: session.firmId,
      clientId,
      uploadedById: session.userId,
      filename: file.name,
      mimeType: file.type || "application/octet-stream",
      filePath,
      classification,
      confidence,
      rawAiJson,
      status,
      note,
    },
  });

  return NextResponse.json({ item });
}
