import https from "https";
import { URL } from "url";
import type { DistDfeDoc, DistDfeResult } from "@/lib/sefaz/dist-dfe";

/**
 * NFS-e Sistema Nacional (ADN) — distribuição por NSU.
 * Live only: GET {NFSE_ADN_BASE_URL}/DFe/{ultNSU} com mTLS A1.
 */
function padNsu(nsu: string) {
  return nsu.replace(/\D/g, "").padStart(15, "0").slice(-15);
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

export async function nfseAdnLive(opts: {
  cnpj: string;
  ultNsu: string;
  tls: import("@/lib/sefaz/cert-store").CertificateTls;
}): Promise<DistDfeResult> {
  const base = process.env.NFSE_ADN_BASE_URL;
  if (!base) {
    throw new Error(
      "NFSE_ADN_BASE_URL não configurada (ex.: URL do ADN/Sefin Nacional)",
    );
  }
  const ult = padNsu(opts.ultNsu);
  const url = `${base.replace(/\/$/, "")}/DFe/${ult}`;
  const { status, text } = await httpsGet({
    url,
    tls: opts.tls,
  });
  if (status < 200 || status >= 300) {
    throw new Error(`NFS-e ADN HTTP ${status}: ${text.slice(0, 400)}`);
  }

  // ADN pode devolver JSON ou lote XML — parse flexível
  try {
    const json = JSON.parse(text) as {
      ultNSU?: string;
      maxNSU?: string;
      loteDFe?: Array<{ NSU?: string; XML?: string; chaveAcesso?: string }>;
    };
    const docs: DistDfeDoc[] = (json.loteDFe ?? []).map((d, i) => ({
      nsu: padNsu(String(d.NSU ?? Number(ult) + i + 1)),
      schema: "NFSe",
      xml: d.XML ?? `<NFSe><infNFSe><chNFSe>${d.chaveAcesso ?? ""}</chNFSe></infNFSe></NFSe>`,
      accessKey: d.chaveAcesso,
      docType: "OTHER" as const,
      direction: "IN" as const,
      issuedAt: new Date(),
    }));
    const ultNsu = padNsu(String(json.ultNSU ?? ult));
    return {
      cStat: docs.length ? "138" : "137",
      xMotivo: docs.length ? "Documentos NFS-e" : "Nenhum documento",
      ultNsu,
      maxNsu: padNsu(String(json.maxNSU ?? ultNsu)),
      docs,
    };
  } catch {
    return {
      cStat: "138",
      xMotivo: "Resposta ADN (XML bruto)",
      ultNsu: ult,
      maxNsu: ult,
      docs: [
        {
          nsu: ult,
          schema: "NFSe",
          xml: text,
          docType: "OTHER",
          direction: "IN",
          accessKey: `${opts.cnpj.replace(/\D/g, "").slice(0, 8)}${Date.now()}`.padEnd(44, "0").slice(0, 44),
        },
      ],
    };
  }
}
