import https from "https";
import { XMLParser } from "fast-xml-parser";
import { inflateRawSync, gunzipSync } from "zlib";
import { URL } from "url";

export const DISTDFE_URLS = {
  "1": "https://www1.nfe.fazenda.gov.br/NFeDistribuicaoDFe/NFeDistribuicaoDFe.asmx",
  "2": "https://hom.nfe.fazenda.gov.br/NFeDistribuicaoDFe/NFeDistribuicaoDFe.asmx",
} as const;

export type DistDfeDoc = {
  nsu: string;
  schema: string;
  xml: string;
  accessKey?: string;
  docType: "NFE" | "EVENT" | "RESUMO" | "OTHER";
  direction?: "IN" | "OUT";
  issuerCnpj?: string;
  recipientCnpj?: string;
  amountCents?: number;
  issuedAt?: Date;
};

export type DistDfeResult = {
  cStat: string;
  xMotivo: string;
  ultNsu: string;
  maxNsu: string;
  docs: DistDfeDoc[];
  rawSoap?: string;
};

function padNsu(nsu: string) {
  return nsu.replace(/\D/g, "").padStart(15, "0").slice(-15);
}

const NFE_SOAP_ACTION =
  "http://www.portalfiscal.inf.br/nfe/wsdl/NFeDistribuicaoDFe/nfeDistDFeInteresse";

function buildDistXml(cnpj: string, tpAmb: string, ultNsu: string) {
  const dig = cnpj.replace(/\D/g, "");
  const nsu = padNsu(ultNsu);
  // cUFAutor 91 = Ambiente Nacional (serviço DistDFe é AN)
  return (
    `<distDFeInt xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.01">` +
    `<tpAmb>${tpAmb}</tpAmb>` +
    `<cUFAutor>91</cUFAutor>` +
    `<CNPJ>${dig}</CNPJ>` +
    `<distNSU><ultNSU>${nsu}</ultNSU></distNSU></distDFeInt>`
  );
}

/** SOAP 1.2 — ASMX exige `action` no Content-Type (sem isso → HTTP 404 HTML). */
function buildSoap12(cnpj: string, tpAmb: string, ultNsu: string) {
  const dist = buildDistXml(cnpj, tpAmb, ultNsu);
  return (
    `<?xml version="1.0" encoding="utf-8"?>` +
    `<soap12:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" ` +
    `xmlns:xsd="http://www.w3.org/2001/XMLSchema" ` +
    `xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">` +
    `<soap12:Body>` +
    `<nfeDistDFeInteresse xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeDistribuicaoDFe">` +
    `<nfeDadosMsg>${dist}</nfeDadosMsg>` +
    `</nfeDistDFeInteresse></soap12:Body></soap12:Envelope>`
  );
}

/** SOAP 1.1 fallback */
function buildSoap11(cnpj: string, tpAmb: string, ultNsu: string) {
  const dist = buildDistXml(cnpj, tpAmb, ultNsu);
  return (
    `<?xml version="1.0" encoding="utf-8"?>` +
    `<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" ` +
    `xmlns:xsd="http://www.w3.org/2001/XMLSchema" ` +
    `xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">` +
    `<soap:Body>` +
    `<nfeDistDFeInteresse xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeDistribuicaoDFe">` +
    `<nfeDadosMsg>${dist}</nfeDadosMsg>` +
    `</nfeDistDFeInteresse></soap:Body></soap:Envelope>`
  );
}

async function httpsPostSoap(opts: {
  url: string;
  body: string;
  tls: import("@/lib/sefaz/cert-store").CertificateTls;
  headers: Record<string, string>;
}): Promise<{ status: number; text: string }> {
  const { resolveSefazAgent } = await import("@/lib/sefaz/sefaz-agent");
  const u = new URL(opts.url);
  const agent = await resolveSefazAgent(opts.tls);
  const bodyBuf = Buffer.from(opts.body, "utf8");

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        protocol: u.protocol,
        hostname: u.hostname,
        port: u.port || 443,
        path: u.pathname + u.search,
        method: "POST",
        agent,
        headers: {
          ...opts.headers,
          "Content-Length": bodyBuf.length,
        },
        timeout: 60000,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          resolve({
            status: res.statusCode ?? 0,
            text: Buffer.concat(chunks).toString("utf8"),
          });
        });
      },
    );
    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("Timeout na chamada SEFAZ DistDFe"));
    });
    req.write(bodyBuf);
    req.end();
  });
}

function decodeDocZip(b64: string): string {
  const buf = Buffer.from(b64, "base64");
  try {
    return inflateRawSync(buf).toString("utf8");
  } catch {
    try {
      return gunzipSync(buf).toString("utf8");
    } catch {
      return buf.toString("utf8");
    }
  }
}

function parseNfeFields(xml: string, interestedCnpj: string): Partial<DistDfeDoc> {
  const parser = new XMLParser({
    ignoreAttributes: false,
    removeNSPrefix: true,
  });
  try {
    const parsed = parser.parse(xml);
    const nfe = parsed.nfeProc?.NFe?.infNFe ?? parsed.NFe?.infNFe;
    if (!nfe) {
      const ch =
        xml.match(/Id="NFe(\d{44})"/)?.[1] ??
        xml.match(/<chNFe>(\d{44})<\/chNFe>/)?.[1];
      return {
        accessKey: ch,
        docType: xml.includes("resNFe")
          ? "RESUMO"
          : xml.includes("procEvento")
            ? "EVENT"
            : "OTHER",
      };
    }
    const accessKey =
      (nfe["@_Id"] as string | undefined)?.replace(/^NFe/, "") ?? undefined;
    const issuerCnpj = String(nfe.emit?.CNPJ ?? "");
    const recipientCnpj = String(nfe.dest?.CNPJ ?? nfe.dest?.CPF ?? "");
    const total = Number(nfe.total?.ICMSTot?.vNF ?? 0);
    const dhEmi = nfe.ide?.dhEmi ?? nfe.ide?.dEmi;
    const interested = interestedCnpj.replace(/\D/g, "");
    const direction =
      issuerCnpj.replace(/\D/g, "") === interested ? "OUT" : "IN";

    return {
      accessKey,
      docType: "NFE",
      issuerCnpj,
      recipientCnpj,
      amountCents: Number.isFinite(total) ? Math.round(total * 100) : undefined,
      issuedAt: dhEmi ? new Date(dhEmi) : undefined,
      direction,
    };
  } catch {
    return { docType: "OTHER" };
  }
}

function findRetDist(obj: unknown): unknown {
  if (!obj || typeof obj !== "object") return null;
  if ("retDistDFeInt" in (obj as object)) {
    return (obj as { retDistDFeInt: unknown }).retDistDFeInt;
  }
  if ("cStat" in (obj as object) && "xMotivo" in (obj as object)) return obj;
  for (const v of Object.values(obj as object)) {
    const found = findRetDist(v);
    if (found) return found;
  }
  return null;
}

function extractRetDist(soapXml: string, interestedCnpj: string): DistDfeResult {
  const parser = new XMLParser({
    ignoreAttributes: false,
    removeNSPrefix: true,
    isArray: (name) => name === "docZip",
  });
  const parsed = parser.parse(soapXml);
  const ret = findRetDist(parsed);

  if (!ret) {
    return {
      cStat: "999",
      xMotivo: "Resposta SEFAZ sem retDistDFeInt",
      ultNsu: "0",
      maxNsu: "0",
      docs: [],
      rawSoap: soapXml.slice(0, 2000),
    };
  }

  const retObj =
    typeof ret === "string"
      ? parser.parse(ret).retDistDFeInt ?? parser.parse(ret)
      : ret;

  const typed = retObj as Record<string, unknown>;
  const cStat = String(typed.cStat ?? "999");
  const xMotivo = String(typed.xMotivo ?? "");
  const ultNsu = padNsu(String(typed.ultNSU ?? "0"));
  const maxNsu = padNsu(String(typed.maxNSU ?? ultNsu));

  const lote = typed.loteDistDFeInt as { docZip?: unknown[] } | undefined;
  const zips = lote?.docZip ?? [];
  const docs: DistDfeDoc[] = [];

  for (const z of zips) {
    const item = z as Record<string, unknown>;
    const nsu = padNsu(String(item["@_NSU"] ?? item.NSU ?? "0"));
    const schema = String(item["@_schema"] ?? item.schema ?? "");
    const b64 = typeof z === "string" ? z : String(item["#text"] ?? "");
    if (!b64 || b64.length < 8) continue;
    const xml = decodeDocZip(b64);
    docs.push({
      nsu,
      schema,
      xml,
      docType: "OTHER",
      ...parseNfeFields(xml, interestedCnpj),
    });
  }

  return { cStat, xMotivo, ultNsu, maxNsu, docs };
}

export async function distDfeLive(opts: {
  cnpj: string;
  tpAmb: "1" | "2";
  ultNsu: string;
  tls: import("@/lib/sefaz/cert-store").CertificateTls;
}): Promise<DistDfeResult> {
  const url = DISTDFE_URLS[opts.tpAmb];

  const attempts: Array<{ body: string; headers: Record<string, string> }> = [
    {
      body: buildSoap12(opts.cnpj, opts.tpAmb, opts.ultNsu),
      headers: {
        "Content-Type": `application/soap+xml; charset=utf-8; action="${NFE_SOAP_ACTION}"`,
      },
    },
    {
      body: buildSoap11(opts.cnpj, opts.tpAmb, opts.ultNsu),
      headers: {
        "Content-Type": "text/xml; charset=utf-8",
        SOAPAction: `"${NFE_SOAP_ACTION}"`,
      },
    },
  ];

  let lastStatus = 0;
  let lastText = "";
  for (const attempt of attempts) {
    const { status, text } = await httpsPostSoap({
      url,
      body: attempt.body,
      tls: opts.tls,
      headers: attempt.headers,
    });
    lastStatus = status;
    lastText = text;
    if (status >= 200 && status < 300) {
      return extractRetDist(text, opts.cnpj);
    }
    // 404 ASMX = sem action / SOAP errado → tenta próximo formato
    if (status !== 404 && status !== 415) break;
  }

  throw new Error(`SEFAZ HTTP ${lastStatus}: ${lastText.slice(0, 400)}`);
}
