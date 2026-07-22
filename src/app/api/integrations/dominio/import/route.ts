import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { readSession } from "@/lib/auth";
import { onlyDigits } from "@/lib/crypto-secret";

/**
 * Importação operacional Domínio via CSV (export do sistema).
 * Domínio Contábil não oferece API pública simples como Omie —
 * o caminho real para o escritório testar hoje é exportar clientes e importar aqui.
 *
 * CSV esperado (cabeçalho na 1ª linha):
 * cnpj;razao_social;nome_fantasia;email;regime
 * (também aceita vírgula como separador)
 */
const rowSchema = z.object({
  cnpj: z.string().min(11),
  legalName: z.string().min(2),
  tradeName: z.string().optional(),
  email: z.string().email().optional().or(z.literal("")),
  regime: z.string().optional(),
});

function parseCsv(text: string) {
  const lines = text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 2) return [];

  const sep = lines[0]!.includes(";") ? ";" : ",";
  const headers = lines[0]!.split(sep).map((h) =>
    h.trim().toLowerCase().replace(/\s+/g, "_"),
  );

  const idx = (names: string[]) =>
    headers.findIndex((h) => names.some((n) => h.includes(n)));

  const iCnpj = idx(["cnpj", "cpf"]);
  const iRazao = idx(["razao", "razão", "nome"]);
  const iFantasia = idx(["fantasia", "trade"]);
  const iEmail = idx(["email", "e-mail"]);
  const iRegime = idx(["regime", "tribut"]);

  if (iCnpj < 0 || iRazao < 0) {
    throw new Error(
      "CSV inválido. Cabeçalho mínimo: cnpj;razao_social (ou razao social)",
    );
  }

  const rows = [];
  for (const line of lines.slice(1)) {
    const cols = line.split(sep).map((c) => c.trim().replace(/^"|"$/g, ""));
    rows.push({
      cnpj: cols[iCnpj] ?? "",
      legalName: cols[iRazao] ?? "",
      tradeName: iFantasia >= 0 ? cols[iFantasia] : undefined,
      email: iEmail >= 0 ? cols[iEmail] : undefined,
      regime: iRegime >= 0 ? cols[iRegime] : undefined,
    });
  }
  return rows;
}

export async function POST(req: Request) {
  const session = await readSession();
  if (!session || session.role === "CLIENT") {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json(
      { error: "Envie o CSV exportado do Domínio (campo file)" },
      { status: 400 },
    );
  }

  const text = await file.text();
  let rawRows;
  try {
    rawRows = parseCsv(text);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "CSV inválido" },
      { status: 400 },
    );
  }

  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const raw of rawRows) {
    const cnpj = onlyDigits(raw.cnpj);
    if (cnpj.length !== 14 && cnpj.length !== 11) {
      skipped += 1;
      continue;
    }
    const parsed = rowSchema.safeParse({
      ...raw,
      cnpj,
      email: raw.email || "",
    });
    if (!parsed.success) {
      skipped += 1;
      continue;
    }

    const regime = (parsed.data.regime || "SIMPLES")
      .toUpperCase()
      .replace(/\s+/g, "_");
    const allowed = ["SIMPLES", "LUCRO_PRESUMIDO", "LUCRO_REAL", "MEI"];
    const regimeSafe = allowed.includes(regime) ? regime : "SIMPLES";

    const existing = await prisma.client.findUnique({
      where: { firmId_cnpj: { firmId: session.firmId, cnpj } },
    });

    const data = {
      legalName: parsed.data.legalName,
      tradeName: parsed.data.tradeName || null,
      email: parsed.data.email || null,
      regime: regimeSafe,
      active: true,
    };

    if (existing) {
      await prisma.client.update({ where: { id: existing.id }, data });
      updated += 1;
    } else {
      await prisma.client.create({
        data: { firmId: session.firmId, cnpj, ...data },
      });
      created += 1;
    }
  }

  await prisma.integration.upsert({
    where: {
      firmId_provider: { firmId: session.firmId, provider: "DOMINIO" },
    },
    create: {
      firmId: session.firmId,
      provider: "DOMINIO",
      status: "CONNECTED",
      lastSyncAt: new Date(),
      metaJson: JSON.stringify({
        mode: "CSV_IMPORT",
        lastImport: { created, updated, skipped },
      }),
    },
    update: {
      status: "CONNECTED",
      lastSyncAt: new Date(),
      lastError: null,
      metaJson: JSON.stringify({
        mode: "CSV_IMPORT",
        lastImport: { created, updated, skipped },
      }),
    },
  });

  return NextResponse.json({ created, updated, skipped });
}
