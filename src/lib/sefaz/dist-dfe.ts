import https from "https";
import { XMLParser } from "fast-xml-parser";
import { inflateRawSync, gunzipSync } from "zlib";
import { URL } from "url";
import { resolveCufAutor } from "@/lib/sefaz/cuf-autor";

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
  // cUFAutor é do tipo TCodUfIBGE — só aceita UF real (11-53). 91 ("Ambiente
  // Nacional") não é um TCodUfIBGE válido aqui e é rejeitado com "215-Falha
  // no esquema xml" (mesma regra do CT-e — ver cuf-autor.ts).
  return (
    `<distDFeInt xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.01">` +
    `<tpAmb>${tpAmb}</tpAmb>` +
    `<cUFAutor>${resolveCufAutor()}</cUFAutor>` +
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

// Um XML de NF-e raramente passa de algumas centenas de KB. Limitamos a saída
// da descompressão a 8 MB para impedir "zip bomb" (payload minúsculo que
// expande para gigabytes e derruba o processo).
const MAX_XML_BYTES = 8 * 1024 * 1024;

function decodeDocZip(b64: string): string {
  const buf = Buffer.from(b64, "base64");
  try {
    return inflateRawSync(buf, { maxOutputLength: MAX_XML_BYTES }).toString("utf8");
  } catch {
    try {
      return gunzipSync(buf, { maxOutputLength: MAX_XML_BYTES }).toString("utf8");
    } catch {
      // Não comprimido (ou estourou o limite): usa como texto, limitado.
      return buf.subarray(0, MAX_XML_BYTES).toString("utf8");
    }
  }
}

function parseNfeFields(xml: string, interestedCnpj: string): Partial<DistDfeDoc> {
  // parseTagValue:false — sem isso, o fast-xml-parser converte texto
  // numérico em Number: CNPJ com zero à esquerda perde o zero, e chNFe
  // (44 dígitos) estoura a precisão do float e vira algo como "3.5e+43"
  // (chave de acesso corrompida). Convertendo manualmente (Number()/String())
  // só onde precisamos de número, mantemos CNPJ/chave como string exata.
  const parser = new XMLParser({
    ignoreAttributes: false,
    removeNSPrefix: true,
    parseTagValue: false,
  });
  try {
    const parsed = parser.parse(xml);
    const nfe = parsed.nfeProc?.NFe?.infNFe ?? parsed.NFe?.infNFe;
    if (!nfe) {
      // resNFe: leiaute de resumo devolvido pelo DistDFe quando o interessado
      // não é o emitente (o caso mais comum para captura "IN"). Não tem
      // <dest>, mas TEM CNPJ do emitente, valor (vNF) e data de emissão
      // (dhEmi) — sem isso, todo documento resumo caía em "sem valor",
      // reprovando na auditoria (ZERO_AMOUNT) mesmo sendo um NF-e válido.
      const res = parsed.resNFe;
      if (res) {
        const issuerCnpj = String(res.CNPJ ?? "");
        const total = Number(res.vNF ?? 0);
        const interested = interestedCnpj.replace(/\D/g, "");
        const direction =
          issuerCnpj.replace(/\D/g, "") === interested ? "OUT" : "IN";
        return {
          accessKey: String(res.chNFe ?? "") || undefined,
          docType: "RESUMO",
          issuerCnpj: issuerCnpj || undefined,
          amountCents: Number.isFinite(total) ? Math.round(total * 100) : undefined,
          issuedAt: res.dhEmi ? new Date(res.dhEmi) : undefined,
          direction,
        };
      }
      const ch =
        xml.match(/Id="NFe(\d{44})"/)?.[1] ??
        xml.match(/<chNFe>(\d{44})<\/chNFe>/)?.[1];
      return {
        accessKey: ch,
        docType: xml.includes("procEvento") ? "EVENT" : "OTHER",
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
    parseTagValue: false,
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
