import https from "https";
import { XMLParser } from "fast-xml-parser";
import { inflateRawSync, gunzipSync } from "zlib";
import { URL } from "url";
import type { DistDfeDoc, DistDfeResult } from "@/lib/sefaz/dist-dfe";

export const CTE_DISTDFE_URLS = {
  "1": "https://www1.cte.fazenda.gov.br/CTeDistribuicaoDFe/CTeDistribuicaoDFe.asmx",
  "2": "https://hom1.cte.fazenda.gov.br/CTeDistribuicaoDFe/CTeDistribuicaoDFe.asmx",
} as const;

function padNsu(nsu: string) {
  return nsu.replace(/\D/g, "").padStart(15, "0").slice(-15);
}

function buildSoap(cnpj: string, tpAmb: string, ultNsu: string) {
  const dig = cnpj.replace(/\D/g, "");
  const nsu = padNsu(ultNsu);
  const dist =
    `<distDFeInt xmlns="http://www.portalfiscal.inf.br/cte" versao="1.00">` +
    `<tpAmb>${tpAmb}</tpAmb><CNPJ>${dig}</CNPJ>` +
    `<distNSU><ultNSU>${nsu}</ultNSU></distNSU></distDFeInt>`;

  return (
    `<?xml version="1.0" encoding="utf-8"?>` +
    `<soap12:Envelope xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">` +
    `<soap12:Body>` +
    `<cteDistDFeInteresse xmlns="http://www.portalfiscal.inf.br/cte/wsdl/CTeDistribuicaoDFe">` +
    `<cteDadosMsg><![CDATA[${dist}]]></cteDadosMsg>` +
    `</cteDistDFeInteresse></soap12:Body></soap12:Envelope>`
  );
}

function httpsPost(opts: {
  url: string;
  body: string;
  pfx: Buffer;
  passphrase: string;
}): Promise<{ status: number; text: string }> {
  const u = new URL(opts.url);
  const agent = new https.Agent({
    pfx: opts.pfx,
    passphrase: opts.passphrase,
    rejectUnauthorized: true,
  });

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
          "Content-Type": "application/soap+xml; charset=utf-8",
          "Content-Length": Buffer.byteLength(opts.body),
        },
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
      reject(new Error("Timeout CT-e DistDFe"));
    });
    req.write(opts.body);
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

function parseCte(xml: string, interestedCnpj: string): Partial<DistDfeDoc> {
  const parser = new XMLParser({
    ignoreAttributes: false,
    removeNSPrefix: true,
  });
  try {
    const parsed = parser.parse(xml);
    const inf =
      parsed.cteProc?.CTe?.infCte ??
      parsed.CTe?.infCte ??
      parsed.cteOSProc?.CTeOS?.infCteOS;
    const ch =
      (inf?.["@_Id"] as string | undefined)?.replace(/^CTe/, "") ??
      xml.match(/Id="CTe(\d{44})"/)?.[1];
    const issuer = String(inf?.emit?.CNPJ ?? "");
    const toma =
      String(inf?.ide?.toma3?.toma ?? inf?.ide?.toma4?.CNPJ ?? "") ||
      String(inf?.rem?.CNPJ ?? "");
    const dig = interestedCnpj.replace(/\D/g, "");
    const direction = issuer.replace(/\D/g, "") === dig ? "OUT" : "IN";
    const vTPrest = Number(inf?.vPrest?.vTPrest ?? 0);
    return {
      accessKey: ch,
      docType: "NFE", // stored as CTE via caller override
      issuerCnpj: issuer,
      recipientCnpj: toma,
      direction,
      amountCents: Number.isFinite(vTPrest) ? Math.round(vTPrest * 100) : undefined,
      issuedAt: inf?.ide?.dhEmi ? new Date(inf.ide.dhEmi) : undefined,
    };
  } catch {
    return {};
  }
}

function findRet(obj: unknown): unknown {
  if (!obj || typeof obj !== "object") return null;
  if ("retDistDFeInt" in (obj as object)) {
    return (obj as { retDistDFeInt: unknown }).retDistDFeInt;
  }
  if ("cStat" in (obj as object) && "xMotivo" in (obj as object)) return obj;
  for (const v of Object.values(obj as object)) {
    const found = findRet(v);
    if (found) return found;
  }
  return null;
}

function extract(soapXml: string, cnpj: string): DistDfeResult {
  const parser = new XMLParser({
    ignoreAttributes: false,
    removeNSPrefix: true,
    isArray: (name) => name === "docZip",
  });
  const parsed = parser.parse(soapXml);
  const ret = findRet(parsed) as Record<string, unknown> | null;
  if (!ret) {
    return {
      cStat: "999",
      xMotivo: "Resposta CT-e sem retDistDFeInt",
      ultNsu: "0",
      maxNsu: "0",
      docs: [],
    };
  }
  const typed =
    typeof ret === "string"
      ? (parser.parse(ret).retDistDFeInt as Record<string, unknown>)
      : ret;
  const ultNsu = padNsu(String(typed.ultNSU ?? "0"));
  const maxNsu = padNsu(String(typed.maxNSU ?? ultNsu));
  const lote = typed.loteDistDFeInt as { docZip?: unknown[] } | undefined;
  const docs: DistDfeDoc[] = [];
  for (const z of lote?.docZip ?? []) {
    const item = z as Record<string, unknown>;
    const b64 = typeof z === "string" ? z : String(item["#text"] ?? "");
    if (!b64 || b64.length < 8) continue;
    const xml = decodeDocZip(b64);
    docs.push({
      nsu: padNsu(String(item["@_NSU"] ?? "0")),
      schema: String(item["@_schema"] ?? ""),
      xml,
      docType: "OTHER",
      ...parseCte(xml, cnpj),
    });
  }
  return {
    cStat: String(typed.cStat ?? "999"),
    xMotivo: String(typed.xMotivo ?? ""),
    ultNsu,
    maxNsu,
    docs,
  };
}

export async function cteDistDfeLive(opts: {
  cnpj: string;
  tpAmb: "1" | "2";
  ultNsu: string;
  pfx: Buffer;
  passphrase: string;
}): Promise<DistDfeResult> {
  const { status, text } = await httpsPost({
    url: CTE_DISTDFE_URLS[opts.tpAmb],
    body: buildSoap(opts.cnpj, opts.tpAmb, opts.ultNsu),
    pfx: opts.pfx,
    passphrase: opts.passphrase,
  });
  if (status < 200 || status >= 300) {
    throw new Error(`CT-e DistDFe HTTP ${status}: ${text.slice(0, 400)}`);
  }
  return extract(text, opts.cnpj);
}

export function cteDistDfeMock(opts: { cnpj: string; ultNsu: string }): DistDfeResult {
  const dig = opts.cnpj.replace(/\D/g, "").padStart(14, "0").slice(0, 14);
  const base = Number(opts.ultNsu.replace(/\D/g, "") || "0");
  const docs: DistDfeDoc[] = [];
  for (let i = 1; i <= 2; i++) {
    const accessKey = `${dig.slice(0, 8)}572607${dig}${"5512345678901"}${i}`
      .replace(/\D/g, "")
      .padEnd(44, "0")
      .slice(0, 44);
    const v = (350 * i + 10).toFixed(2);
    const xml =
      `<?xml version="1.0"?>` +
      `<cteProc xmlns="http://www.portalfiscal.inf.br/cte"><CTe><infCte Id="CTe${accessKey}">` +
      `<ide><dhEmi>${new Date().toISOString()}</dhEmi></ide>` +
      `<emit><CNPJ>11222333000144</CNPJ></emit>` +
      `<rem><CNPJ>${dig}</CNPJ></rem>` +
      `<vPrest><vTPrest>${v}</vTPrest></vPrest>` +
      `</infCte></CTe></cteProc>`;
    docs.push({
      nsu: padNsu(String(base + i)),
      schema: "procCTe_v4.00",
      xml,
      accessKey,
      docType: "OTHER",
      direction: "IN",
      issuerCnpj: "11222333000144",
      recipientCnpj: dig,
      amountCents: Math.round(Number(v) * 100),
      issuedAt: new Date(),
    });
  }
  const ult = padNsu(String(base + 2));
  return {
    cStat: "138",
    xMotivo: "Documento localizado (MOCK CT-e DistDFe)",
    ultNsu: ult,
    maxNsu: ult,
    docs,
  };
}
