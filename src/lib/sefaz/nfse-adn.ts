import https from "https";
import { URL } from "url";
import { inflateRawSync, gunzipSync } from "zlib";
import type { DistDfeDoc, DistDfeResult } from "@/lib/sefaz/dist-dfe";

/**
 * NFS-e Sistema Nacional (ADN) — distribuição por NSU.
 * Live only: GET {base}/DFe/{ultNSU} com mTLS A1.
 *
 * O host da API ADN "Contribuintes" é `adn.nfse.gov.br/contribuintes`
 * (produção) / `adn.producaorestrita.nfse.gov.br/contribuintes` (produção
 * restrita) — NÃO é o mesmo host do SEFIN Nacional (`sefin.nfse.gov.br`,
 * usado só para emissão/consulta por chave de acesso). Usar o host do SEFIN
 * aqui resulta em "ADN HTTP 404: No HTTP resource was found...".
 * Confirmado no pacote oficial `open-nfse` (ambiente.js) e no manual do ADN.
 */
const ADN_BASE_URLS = {
  "1": "https://adn.nfse.gov.br/contribuintes",
  "2": "https://adn.producaorestrita.nfse.gov.br/contribuintes",
} as const;

function adnBaseUrl(tpAmb: "1" | "2"): string {
  const override =
    tpAmb === "2"
      ? process.env.NFSE_ADN_BASE_URL_HOM?.trim()
      : process.env.NFSE_ADN_BASE_URL?.trim();
  return (override || ADN_BASE_URLS[tpAmb]).replace(/\/$/, "");
}

function padNsu(nsu: string) {
  return nsu.replace(/\D/g, "").padStart(15, "0").slice(-15);
}

const MAX_XML_BYTES = 8 * 1024 * 1024;

function decodeArquivoXml(b64: string): string {
  const buf = Buffer.from(b64, "base64");
  try {
    return gunzipSync(buf, { maxOutputLength: MAX_XML_BYTES }).toString("utf8");
  } catch {
    try {
      return inflateRawSync(buf, { maxOutputLength: MAX_XML_BYTES }).toString(
        "utf8",
      );
    } catch {
      return buf.subarray(0, MAX_XML_BYTES).toString("utf8");
    }
  }
}

async function httpsGet(opts: {
  url: string;
  tls: import("@/lib/sefaz/cert-store").CertificateTls;
}): Promise<{ status: number; text: string }> {
  const { resolveSefazAgent } = await import("@/lib/sefaz/sefaz-agent");
  const u = new URL(opts.url);
  const agent = await resolveSefazAgent(opts.tls);

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        protocol: u.protocol,
        hostname: u.hostname,
        port: u.port || 443,
        path: u.pathname + u.search,
        method: "GET",
        agent,
        headers: { Accept: "application/json, application/xml" },
        timeout: 60000,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () =>
          resolve({
            status: res.statusCode ?? 0,
            text: Buffer.concat(chunks).toString("utf8"),
          }),
        );
      },
    );
    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("Timeout NFS-e ADN"));
    });
    req.end();
  });
}

type AdnLoteItem = {
  NSU?: number | string;
  ChaveAcesso?: string;
  TipoDocumento?: string;
  TipoEvento?: string | null;
  ArquivoXml?: string;
  DataHoraGeracao?: string;
};

type AdnResponse = {
  StatusProcessamento?: string;
  LoteDFe?: AdnLoteItem[];
  Alertas?: Array<{ Codigo?: string; Descricao?: string }>;
  Erros?: Array<{ Codigo?: string; Descricao?: string }>;
};

/**
 * O ADN Contribuintes usa o STATUS HTTP de forma não convencional: 400/404
 * também podem trazer um corpo JSON válido (ex.: "nenhum documento
 * localizado" ou rejeição de negócio) — o status real do processamento vem
 * no campo `StatusProcessamento`, não no código HTTP. Confirmado no cliente
 * oficial `open-nfse` (http/client.js `acceptedStatuses: [400, 404]` +
 * dfe/fetch-by-nsu.js). Por isso só tratamos como erro de transporte/rota
 * (host errado, proxy, WAF) quando o corpo não tem esse campo.
 */
const BODY_MEANINGFUL_STATUSES = new Set([200, 400, 404]);

export async function nfseAdnLive(opts: {
  cnpj: string;
  tpAmb: "1" | "2";
  ultNsu: string;
  tls: import("@/lib/sefaz/cert-store").CertificateTls;
}): Promise<DistDfeResult> {
  const base = adnBaseUrl(opts.tpAmb);
  const ult = padNsu(opts.ultNsu);
  const url = `${base}/DFe/${ult}`;
  const { status, text } = await httpsGet({
    url,
    tls: opts.tls,
  });

  if (!BODY_MEANINGFUL_STATUSES.has(status)) {
    throw new Error(`NFS-e ADN HTTP ${status}: ${text.slice(0, 400)}`);
  }

  let json: AdnResponse;
  try {
    json = JSON.parse(text) as AdnResponse;
  } catch {
    throw new Error(
      `NFS-e ADN HTTP ${status}: resposta não é JSON — provável rota/host errado ou proxy/WAF. ${text.slice(0, 300)}`,
    );
  }
  if (typeof json.StatusProcessamento !== "string") {
    throw new Error(
      `NFS-e ADN HTTP ${status}: resposta sem StatusProcessamento — provável rota/host errado (verifique NFSE_ADN_BASE_URL) ou proxy/WAF no lugar do serviço. ${text.slice(0, 300)}`,
    );
  }

  const lote = json.LoteDFe ?? [];
  const docs: DistDfeDoc[] = lote.map((item) => ({
    nsu: padNsu(String(item.NSU ?? "0")),
    schema: item.TipoDocumento === "EVENTO" ? "EventoNFSe" : "NFSe",
    xml: item.ArquivoXml
      ? decodeArquivoXml(item.ArquivoXml)
      : `<NFSe><infNFSe><chNFSe>${item.ChaveAcesso ?? ""}</chNFSe></infNFSe></NFSe>`,
    accessKey: item.ChaveAcesso,
    docType: "OTHER" as const,
    direction: "IN" as const,
    issuedAt: item.DataHoraGeracao ? new Date(item.DataHoraGeracao) : new Date(),
  }));

  const maxDocNsu = lote.reduce((max, item) => {
    const n = Number(item.NSU ?? 0);
    return Number.isFinite(n) && n > max ? n : max;
  }, Number(ult));
  const ultNsu = padNsu(String(maxDocNsu));

  if (json.StatusProcessamento === "REJEICAO") {
    const motivo =
      (json.Erros ?? [])
        .map((e) => `${e.Codigo ?? ""} ${e.Descricao ?? ""}`.trim())
        .filter(Boolean)
        .join("; ") || "Rejeição ADN sem detalhe";
    return { cStat: "999", xMotivo: motivo, ultNsu: ult, maxNsu: ult, docs: [] };
  }

  return {
    cStat: docs.length ? "138" : "137",
    xMotivo:
      json.StatusProcessamento === "DOCUMENTOS_LOCALIZADOS"
        ? "Documentos NFS-e localizados"
        : "Nenhum documento localizado",
    ultNsu,
    maxNsu: ultNsu,
    docs,
  };
}
