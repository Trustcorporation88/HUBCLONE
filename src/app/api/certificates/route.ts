import { NextResponse } from "next/server";
import { readSession } from "@/lib/auth";
import { encryptBytes, encryptSecret, onlyDigits } from "@/lib/crypto-secret";
import { inspectPfx, savePfxFile } from "@/lib/sefaz/cert-store";
import { assertPfxTlsReady } from "@/lib/sefaz/pfx-tls";
import { prisma } from "@/lib/db";

export async function GET() {
  const session = await readSession();
  if (!session) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const certs = await prisma.certificate.findMany({
    where: { firmId: session.firmId },
    include: { client: { select: { tradeName: true, legalName: true } } },
    orderBy: { updatedAt: "desc" },
  });

  return NextResponse.json({
    certificates: certs.map((c) => ({
      id: c.id,
      cnpj: c.cnpj,
      label: c.label,
      environment: c.environment,
      lastNsu: c.lastNsu,
      validTo: c.validTo,
      subjectCn: c.subjectCn,
      active: c.active,
      hasBlob: Boolean(c.pfxEnc || c.pemKeyEnc),
      clientName: c.client?.tradeName ?? c.client?.legalName ?? null,
    })),
  });
}

export async function POST(req: Request) {
  const session = await readSession();
  if (!session) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const form = await req.formData();
  const file = form.get("pfx") as File | null;
  const password = String(form.get("password") ?? "");
  const clientId = String(form.get("clientId") ?? "") || null;
  // Produção por padrão — captura real DistDFe
  const environment = String(form.get("environment") ?? "1") === "2" ? "2" : "1";
  const label = String(form.get("label") ?? "A1");

  if (!file || !password) {
    return NextResponse.json(
      { error: "Envie o arquivo .pfx e a senha" },
      { status: 400 },
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  let info;
  let pem;
  try {
    info = await inspectPfx(buffer, password);
    pem = await assertPfxTlsReady(buffer, password);
  } catch (e) {
    return NextResponse.json(
      {
        error:
          e instanceof Error
            ? e.message
            : "Não foi possível ler o certificado (senha incorreta?)",
      },
      { status: 400 },
    );
  }

  if (info.validTo && info.validTo.getTime() < Date.now()) {
    return NextResponse.json(
      { error: "Certificado A1 vencido. Renove antes de cadastrar." },
      { status: 400 },
    );
  }

  let cnpj = info.cnpjFromCert;
  if (clientId) {
    const client = await prisma.client.findFirst({
      where: { id: clientId, firmId: session.firmId },
    });
    if (!client) {
      return NextResponse.json({ error: "Cliente inválido" }, { status: 400 });
    }
    cnpj = onlyDigits(client.cnpj);
  }
  if (!cnpj) {
    return NextResponse.json(
      { error: "CNPJ não identificado no certificado — vincule a um cliente" },
      { status: 400 },
    );
  }

  let pfxPath = "";
  try {
    pfxPath = await savePfxFile(session.firmId, cnpj, buffer);
  } catch {
    pfxPath = "";
  }

  const data = {
    clientId,
    cnpj,
    label,
    pfxPath,
    pfxEnc: encryptBytes(buffer),
    pemKeyEnc: encryptSecret(pem.key),
    pemCertEnc: encryptSecret(pem.cert),
    passwordEnc: encryptSecret(password),
    environment,
    validFrom: info.validFrom,
    validTo: info.validTo,
    subjectCn: info.subjectCn,
    active: true,
  };

  const existing = await prisma.certificate.findFirst({
    where: {
      firmId: session.firmId,
      active: true,
      OR: [...(clientId ? [{ clientId }] : []), { cnpj }],
    },
    orderBy: { updatedAt: "desc" },
  });

  const cert = existing
    ? await prisma.certificate.update({ where: { id: existing.id }, data })
    : await prisma.certificate.create({
        data: { firmId: session.firmId, ...data },
      });

  return NextResponse.json({
    id: cert.id,
    cnpj: cert.cnpj,
    validTo: cert.validTo,
    subjectCn: cert.subjectCn,
    environment: cert.environment,
  });
}
