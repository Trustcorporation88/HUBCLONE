import { prisma } from "@/lib/db";
import { onlyDigits } from "@/lib/crypto-secret";
import { decodeCreds } from "@/lib/integrations";

type OmieCliente = {
  cnpj_cpf?: string;
  razao_social?: string;
  nome_fantasia?: string;
  email?: string;
  cidade?: string;
  inativo?: string;
  pessoa_fisica?: string;
};

type OmieListResponse = {
  pagina?: number;
  total_de_paginas?: number;
  clientes_cadastro?: OmieCliente[];
  faultstring?: string;
  faultcode?: string;
};

function mapRegime(_c: OmieCliente): string {
  return "SIMPLES";
}

async function omieListPage(opts: {
  appKey: string;
  appSecret: string;
  pagina: number;
}): Promise<OmieListResponse> {
  const res = await fetch("https://app.omie.com.br/api/v1/geral/clientes/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      call: "ListarClientes",
      app_key: opts.appKey,
      app_secret: opts.appSecret,
      param: [
        {
          pagina: opts.pagina,
          registros_por_pagina: 50,
          apenas_importado_api: "N",
        },
      ],
    }),
  });

  const data = (await res.json().catch(() => null)) as OmieListResponse | null;
  if (!res.ok) {
    throw new Error(
      `Omie HTTP ${res.status}: ${JSON.stringify(data).slice(0, 300)}`,
    );
  }
  if (data?.faultstring) {
    throw new Error(data.faultstring);
  }
  return data ?? {};
}

/** Importa/atualiza clientes do Omie no tenant (upsert por CNPJ). */
export async function syncOmieClients(firmId: string) {
  const integration = await prisma.integration.findUnique({
    where: { firmId_provider: { firmId, provider: "OMIE" } },
  });
  if (!integration?.credentialsEnc) {
    return {
      error: "Omie não conectado. Salve App Key e App Secret em Integrações.",
      status: 400 as const,
    };
  }

  const creds = decodeCreds(integration.credentialsEnc);
  const appKey = creds.appKey?.trim();
  const appSecret = creds.appSecret?.trim();
  if (!appKey || !appSecret) {
    return {
      error: "Credenciais Omie incompletas (appKey/appSecret).",
      status: 400 as const,
    };
  }

  let page = 1;
  let totalPages = 1;
  let created = 0;
  let updated = 0;
  let skipped = 0;
  const errors: string[] = [];

  try {
    while (page <= totalPages && page <= 40) {
      const data = await omieListPage({ appKey, appSecret, pagina: page });
      totalPages = Math.max(1, Number(data.total_de_paginas ?? 1));
      const list = data.clientes_cadastro ?? [];

      for (const raw of list) {
        if (raw.inativo === "S") {
          skipped += 1;
          continue;
        }
        const cnpj = onlyDigits(raw.cnpj_cpf ?? "");
        if (cnpj.length !== 14 && cnpj.length !== 11) {
          skipped += 1;
          continue;
        }
        // Pessoa física (CPF) — guardamos como string; schema exige cnpj field
        const legalName = (raw.razao_social ?? raw.nome_fantasia ?? "").trim();
        if (!legalName) {
          skipped += 1;
          continue;
        }

        const existing = await prisma.client.findUnique({
          where: { firmId_cnpj: { firmId, cnpj } },
        });

        const payload = {
          legalName,
          tradeName: raw.nome_fantasia?.trim() || null,
          email: raw.email?.trim() || null,
          regime: mapRegime(raw),
          active: true,
        };

        if (existing) {
          await prisma.client.update({
            where: { id: existing.id },
            data: payload,
          });
          updated += 1;
        } else {
          await prisma.client.create({
            data: {
              firmId,
              cnpj,
              ...payload,
            },
          });
          created += 1;
        }
      }

      page += 1;
    }

    await prisma.integration.update({
      where: { id: integration.id },
      data: {
        status: "CONNECTED",
        lastSyncAt: new Date(),
        lastError: null,
        metaJson: JSON.stringify({
          lastImport: { created, updated, skipped, at: new Date().toISOString() },
        }),
      },
    });

    return { created, updated, skipped, pages: totalPages, errors };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Falha no sync Omie";
    await prisma.integration.update({
      where: { id: integration.id },
      data: { status: "ERROR", lastError: message },
    });
    return { error: message, status: 502 as const };
  }
}
