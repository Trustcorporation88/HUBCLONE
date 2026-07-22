import { decryptSecret, encryptSecret } from "@/lib/crypto-secret";

export const INTEGRATION_PROVIDERS = [
  "DOMINIO",
  "OMIE",
  "CLICKSIGN",
  "OPENAI",
] as const;

export type IntegrationProvider = (typeof INTEGRATION_PROVIDERS)[number];

export type ProviderCreds = Record<string, string>;

export function encodeCreds(creds: ProviderCreds): string {
  return encryptSecret(JSON.stringify(creds));
}

export function decodeCreds(payload: string | null | undefined): ProviderCreds {
  if (!payload) return {};
  try {
    return JSON.parse(decryptSecret(payload)) as ProviderCreds;
  } catch {
    return {};
  }
}

export async function testIntegration(
  provider: IntegrationProvider,
  creds: ProviderCreds,
): Promise<{ ok: boolean; detail: string }> {
  if (provider === "OPENAI") {
    const key = creds.apiKey || process.env.OPENAI_API_KEY;
    if (!key) return { ok: false, detail: "OPENAI_API_KEY ausente" };
    const res = await fetch("https://api.openai.com/v1/models", {
      headers: { Authorization: `Bearer ${key}` },
    });
    if (!res.ok) {
      return { ok: false, detail: `OpenAI HTTP ${res.status}` };
    }
    return { ok: true, detail: "OpenAI autenticado" };
  }

  if (provider === "OMIE") {
    const appKey = creds.appKey;
    const appSecret = creds.appSecret;
    if (!appKey || !appSecret) {
      return { ok: false, detail: "Informe appKey e appSecret Omie" };
    }
    const res = await fetch("https://app.omie.com.br/api/v1/geral/empresas/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        call: "ListarEmpresas",
        app_key: appKey,
        app_secret: appSecret,
        param: [{ pagina: 1, registros_por_pagina: 1 }],
      }),
    });
    const text = await res.text();
    if (!res.ok) {
      return { ok: false, detail: `Omie HTTP ${res.status}: ${text.slice(0, 200)}` };
    }
    if (text.toLowerCase().includes("fault") || text.toLowerCase().includes("error")) {
      return { ok: false, detail: text.slice(0, 300) };
    }
    return { ok: true, detail: "Omie respondeu à ListarEmpresas" };
  }

  if (provider === "CLICKSIGN") {
    const token = creds.accessToken;
    const base =
      creds.baseUrl?.replace(/\/$/, "") || "https://app.clicksign.com/api/v1";
    if (!token) return { ok: false, detail: "Informe accessToken ClickSign" };
    const res = await fetch(`${base}/accounts`, {
      headers: {
        Accept: "application/json",
        Authorization: token.startsWith("Bearer ") ? token : `Bearer ${token}`,
      },
    });
    if (!res.ok) {
      return { ok: false, detail: `ClickSign HTTP ${res.status}` };
    }
    return { ok: true, detail: "ClickSign autenticado" };
  }

  if (provider === "DOMINIO") {
    const token = creds.apiToken || creds.token;
    const base = creds.baseUrl?.replace(/\/$/, "");
    if (!token || !base) {
      return {
        ok: false,
        detail: "Domínio exige baseUrl + apiToken (API do parceiro)",
      };
    }
    const res = await fetch(`${base}/health`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    }).catch(() => null);
    if (!res) {
      return {
        ok: false,
        detail: "Não foi possível alcançar a baseUrl Domínio",
      };
    }
    if (!res.ok) {
      return { ok: false, detail: `Domínio HTTP ${res.status}` };
    }
    return { ok: true, detail: "Domínio alcançável" };
  }

  return { ok: false, detail: "Provedor desconhecido" };
}
