import { NextResponse } from "next/server";
import { requireAdminSession, requireStaffSession } from "@/lib/auth";
import { encryptBytes, encryptSecret, onlyDigits } from "@/lib/crypto-secret";
import { inspectPfx } from "@/lib/sefaz/cert-store";
import { assertPfxTlsReady } from "@/lib/sefaz/pfx-tls";
import { prisma } from "@/lib/db";

export async function GET() {
  let session;
  try {
    session = await requireStaffSession();
  } catch {
    return NextResponse.json({ error: "Não autorizado" }, { status: 403 });
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
  let session;
  try {
    session = await requireStaffSession();
  } catch {
    return NextResponse.json({ error: "Não autorizado" }, { status: 403 });
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

  // Nao gravamos mais o .pfx original no disco. O blob cifrado (pfxEnc) e o PEM
  // ja validado bastam, e o arquivo em claro era chave privada do contribuinte
  // exposta no filesystem. pfxPath fica vazio nos cadastros novos e continua
  // sendo LIDO para os antigos.
  const data = {
    clientId,
    cnpj,
    label,
    pfxPath: "",
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

/**
 * Remove o certificado e o material sensivel junto.
 *
 * Antes so existiam GET e POST: nao havia como tirar um A1 do sistema. Isso e
 * problema de LGPD (o certificado e dado do cliente, e contrato acaba) e de
 * resposta a incidente (nao da para revogar o que nao da para apagar).
 *
 * Restrito a OWNER/MANAGER: apagar certificado apaga junto a rastreabilidade
 * das capturas que dependiam dele.
 */
export async function DELETE(req: Request) {
  let session;
  try {
    session = await requireAdminSession();
  } catch {
    return NextResponse.json({ error: "Nao autorizado" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id obrigatorio" }, { status: 400 });
  }

  const cert = await prisma.certificate.findFirst({
    where: { id, firmId: session.firmId },
    select: { id: true, cnpj: true, label: true },
  });
  if (!cert) {
    return NextResponse.json(
      { error: "Certificado nao encontrado" },
      { status: 404 },
    );
  }

  // Zera o material sensivel ANTES de apagar a linha: se o delete falhar por
  // FK, a chave privada ja saiu do banco de qualquer forma.
  await prisma.certificate.update({
    where: { id: cert.id },
    data: {
      pfxEnc: null,
      pemKeyEnc: null,
      pemCertEnc: null,
      passwordEnc: "",
      pfxPath: "",
      active: false,
    },
  });

  await prisma.certificate.delete({ where: { id: cert.id } });

  return NextResponse.json({ ok: true, cnpj: cert.cnpj, label: cert.label });
}
