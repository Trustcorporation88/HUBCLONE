import { prisma } from "@/lib/db";
import { onlyDigits } from "@/lib/crypto-secret";
import { decodeCreds } from "@/lib/integrations";

const DEFAULT_API =
  process.env.PROCONTADOR_API_URL?.replace(/\/$/, "") ||
  "https://contador-api-production.up.railway.app/api/v1";

type CompanyRow = {
  id?: string;
  cnpj?: string;
  name?: string;
  legal_name?: string;
  email?: string;
  phone?: string;
  tax_regime?: string;
  is_active?: boolean;
};

function mapRegime(raw?: string): string {
  const v = (raw ?? "").toLowerCase();
  if (v.includes("simples")) return "SIMPLES";
  if (v.includes("presumido")) return "LUCRO_PRESUMIDO";
  if (v.includes("real")) return "LUCRO_REAL";
  if (v.includes("mei")) return "MEI";
  return "SIMPLES";
}

export async function loginProContador(creds: {
  baseUrl?: string;
  email: string;
  password: string;
}): Promise<{ accessToken: string; baseUrl: string }> {
  const baseUrl = (creds.baseUrl || DEFAULT_API).replace(/\/$/, "");
  let res: Response;
  try {
    res = await fetch(`${baseUrl}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        email: creds.email,
        password: creds.password,
      }),
    });
  } catch (e) {
    const reason = e instanceof Error ? e.message : "fetch failed";
    throw new Error(
      `Não alcançou a API ProContador (${baseUrl}): ${reason}. Use https://contador-api-production.up.railway.app/api/v1 ou https://www.procontador.com.br/api/v1`,
    );
  }
  const data = (await res.json().catch(() => null)) as {
    accessToken?: string;
    data?: { accessToken?: string; refreshToken?: string };
    code?: string;
    error?: string;
    message?: string;
  } | null;

  if (data?.code === "MFA_REQUIRED" || (!res.ok && data?.error === "MFA Required")) {
    throw new Error(
      "Conta com MFA ativo. Use um usuário admin sem MFA para a integração OS.",
    );
  }
  if (!res.ok) {
    throw new Error(
      data?.message || data?.error || `ProContador login HTTP ${res.status}`,
    );
  }
  const accessToken = data?.data?.accessToken ?? data?.accessToken;
  if (!accessToken) {
    throw new Error("ProContador não retornou accessToken");
  }
  return { accessToken, baseUrl };
}

export async function testProContador(creds: Record<string, string>) {
  const email = creds.email?.trim();
  const password = creds.password?.trim();
  if (!email || !password) {
    return {
      ok: false,
      detail: "Informe e-mail e senha de admin do ProContador (www.procontador.com.br)",
    };
  }
  try {
    const { accessToken, baseUrl } = await loginProContador({
      baseUrl: creds.baseUrl,
      email,
      password,
    });
    const res = await fetch(`${baseUrl}/companies?page=1&limit=1`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
      },
    });
    if (!res.ok) {
      return {
        ok: false,
        detail: `Login ok, mas GET /companies falhou (HTTP ${res.status})`,
      };
    }
    return {
      ok: true,
      detail: `ProContador autenticado em ${baseUrl}`,
    };
  } catch (e) {
    return {
      ok: false,
      detail: e instanceof Error ? e.message : "Falha ProContador",
    };
  }
}

/** Importa empresas do ProContador SaaS → Client do OS (upsert por CNPJ). */
export async function syncProContadorClients(firmId: string) {
  const integration = await prisma.integration.findUnique({
    where: { firmId_provider: { firmId, provider: "PROCONTADOR" } },
  });
  if (!integration?.credentialsEnc) {
    return {
      error:
        "ProContador não conectado. Salve e-mail/senha admin em Integrações.",
      status: 400 as const,
    };
  }

  const creds = decodeCreds(integration.credentialsEnc);
  const email = creds.email?.trim();
  const password = creds.password?.trim();
  if (!email || !password) {
    return { error: "Credenciais ProContador incompletas", status: 400 as const };
  }

  let created = 0;
  let updated = 0;
  let skipped = 0;

  try {
    const { accessToken, baseUrl } = await loginProContador({
      baseUrl: creds.baseUrl,
      email,
      password,
    });

    let page = 1;
    let totalPages = 1;

    while (page <= totalPages && page <= 50) {
      const res = await fetch(
        `${baseUrl}/companies?page=${page}&limit=100`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: "application/json",
          },
        },
      );
      const json = (await res.json().catch(() => null)) as {
        data?: CompanyRow[];
        pagination?: { totalPages?: number };
        error?: string;
        message?: string;
      } | null;

      if (!res.ok) {
        throw new Error(
          json?.message || json?.error || `GET /companies HTTP ${res.status}`,
        );
      }

      totalPages = Math.max(1, Number(json?.pagination?.totalPages ?? 1));
      const list = json?.data ?? [];

      for (const row of list) {
        if (row.is_active === false) {
          skipped += 1;
          continue;
        }
        const cnpj = onlyDigits(row.cnpj ?? "");
        if (cnpj.length !== 14 && cnpj.length !== 11) {
          skipped += 1;
          continue;
        }
        const legalName = (row.name || row.legal_name || "").trim();
        if (!legalName) {
          skipped += 1;
          continue;
        }

        const payload = {
          legalName,
          tradeName: legalName,
          email: row.email?.trim() || null,
          whatsapp: row.phone ? onlyDigits(row.phone) : null,
          regime: mapRegime(row.tax_regime),
          active: true,
        };

        const existing = await prisma.client.findUnique({
          where: { firmId_cnpj: { firmId, cnpj } },
        });

        if (existing) {
          await prisma.client.update({
            where: { id: existing.id },
            data: payload,
          });
          updated += 1;
        } else {
          await prisma.client.create({
            data: { firmId, cnpj, ...payload },
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
          source: "procontador-saas",
          lastImport: { created, updated, skipped, at: new Date().toISOString() },
        }),
      },
    });

    return { created, updated, skipped, pages: totalPages };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Falha no sync ProContador";
    await prisma.integration.update({
      where: { id: integration.id },
      data: { status: "ERROR", lastError: message },
    });
    return { error: message, status: 502 as const };
  }
}
