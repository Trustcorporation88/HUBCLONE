import { prisma } from "@/lib/db";
import { decryptSecret, onlyDigits } from "@/lib/crypto-secret";
import { readPfx, saveXmlFile } from "@/lib/sefaz/cert-store";
import { distDfeLive, distDfeMock, type DistDfeResult } from "@/lib/sefaz/dist-dfe";
import { cteDistDfeLive, cteDistDfeMock } from "@/lib/sefaz/cte-dist-dfe";
import { nfseAdnLive, nfseAdnMock } from "@/lib/sefaz/nfse-adn";

export type CaptureKind = "NFE" | "CTE" | "NFSE";

const DOC_TYPE: Record<CaptureKind, string> = {
  NFE: "NFE",
  CTE: "CTE",
  NFSE: "NFSE",
};

const SOURCE: Record<CaptureKind, { live: string; mock: string }> = {
  NFE: { live: "SEFAZ_DISTDFE", mock: "MOCK" },
  CTE: { live: "CTE_DISTDFE", mock: "MOCK_CTE" },
  NFSE: { live: "NFSE_ADN", mock: "MOCK_NFSE" },
};

async function saveDocs(opts: {
  firmId: string;
  clientId: string;
  kind: CaptureKind;
  result: DistDfeResult;
  live: boolean;
}) {
  let saved = 0;
  for (const doc of opts.result.docs) {
    const accessKey =
      doc.accessKey ??
      `${opts.kind}-${doc.nsu}-${Date.now()}`.padEnd(44, "0").slice(0, 44);

    const rawPath = await saveXmlFile(
      opts.firmId,
      opts.clientId,
      `${opts.kind}-${accessKey}`,
      doc.xml,
    );

    try {
      await prisma.xmlDocument.create({
        data: {
          firmId: opts.firmId,
          clientId: opts.clientId,
          accessKey: `${opts.kind}:${accessKey}`.slice(0, 60),
          docType: DOC_TYPE[opts.kind],
          direction: doc.direction ?? "IN",
          issuerCnpj: doc.issuerCnpj,
          recipientCnpj: doc.recipientCnpj,
          issuedAt: doc.issuedAt,
          amountCents: doc.amountCents,
          status: "CAPTURED",
          rawPath,
          nsu: doc.nsu,
          schemaSource: opts.live
            ? SOURCE[opts.kind].live
            : SOURCE[opts.kind].mock,
        },
      });
      saved += 1;
    } catch {
      // duplicate
    }
  }
  return saved;
}

export async function runXmlCapture(opts: {
  firmId: string;
  clientId: string;
  forceMock?: boolean;
  kinds?: CaptureKind[];
}) {
  const kinds = opts.kinds?.length ? opts.kinds : (["NFE"] as CaptureKind[]);

  const client = await prisma.client.findFirst({
    where: { id: opts.clientId, firmId: opts.firmId },
  });
  if (!client) return { error: "Cliente não encontrado", status: 404 as const };

  const cert = await prisma.certificate.findFirst({
    where: {
      firmId: opts.firmId,
      active: true,
      OR: [{ clientId: client.id }, { cnpj: onlyDigits(client.cnpj) }],
    },
    orderBy: { updatedAt: "desc" },
  });

  const sefazMode = (process.env.SEFAZ_MODE ?? "auto").toLowerCase();
  const useLive =
    !opts.forceMock &&
    sefazMode !== "mock" &&
    Boolean(cert) &&
    (sefazMode === "live" || sefazMode === "auto");

  const run = await prisma.captureRun.create({
    data: {
      firmId: opts.firmId,
      clientId: client.id,
      certificateId: cert?.id,
      mode: useLive ? "LIVE" : "MOCK",
      kindsJson: JSON.stringify(kinds),
      status: "RUNNING",
    },
  });

  try {
    const cnpj = onlyDigits(cert?.cnpj ?? client.cnpj);
    const tpAmb = (cert?.environment === "1" ? "1" : "2") as "1" | "2";
    let pfx: Buffer | null = null;
    let passphrase = "";
    if (useLive && cert) {
      pfx = await readPfx(cert.pfxPath);
      passphrase = decryptSecret(cert.passwordEnc);
    }

    let docsFound = 0;
    let docsSaved = 0;
    const summaries: Array<{
      kind: CaptureKind;
      cStat: string;
      xMotivo: string;
      ultNsu: string;
    }> = [];

    for (const kind of kinds) {
      let result: DistDfeResult;

      if (kind === "NFE") {
        const ultNsu = cert?.lastNsu ?? "000000000000000";
        result =
          useLive && cert && pfx
            ? await distDfeLive({
                cnpj,
                tpAmb,
                ultNsu,
                pfx,
                passphrase,
              })
            : distDfeMock({ cnpj, ultNsu });
        if (cert) {
          await prisma.certificate.update({
            where: { id: cert.id },
            data: { lastNsu: result.ultNsu },
          });
        }
      } else if (kind === "CTE") {
        const ultNsu = cert?.lastNsuCte ?? "000000000000000";
        result =
          useLive && cert && pfx
            ? await cteDistDfeLive({
                cnpj,
                tpAmb,
                ultNsu,
                pfx,
                passphrase,
              })
            : cteDistDfeMock({ cnpj, ultNsu });
        if (cert) {
          await prisma.certificate.update({
            where: { id: cert.id },
            data: { lastNsuCte: result.ultNsu },
          });
        }
      } else {
        const ultNsu = cert?.lastNsuNfse ?? "000000000000000";
        result =
          useLive && cert && pfx && process.env.NFSE_ADN_BASE_URL
            ? await nfseAdnLive({ cnpj, ultNsu, pfx, passphrase })
            : nfseAdnMock({ cnpj, ultNsu });
        if (cert) {
          await prisma.certificate.update({
            where: { id: cert.id },
            data: { lastNsuNfse: result.ultNsu },
          });
        }
      }

      docsFound += result.docs.length;
      docsSaved += await saveDocs({
        firmId: opts.firmId,
        clientId: client.id,
        kind,
        result,
        live: useLive,
      });
      summaries.push({
        kind,
        cStat: result.cStat,
        xMotivo: result.xMotivo,
        ultNsu: result.ultNsu,
      });
    }

    await prisma.fiscalPipeline.updateMany({
      where: {
        firmId: opts.firmId,
        clientId: client.id,
        stage: "CAPTURE",
      },
      data: { stage: "AUDIT", stageStatus: "NEEDS_APPROVAL" },
    });

    const finished = await prisma.captureRun.update({
      where: { id: run.id },
      data: {
        status: "DONE",
        docsFound,
        docsSaved,
        ultNsu: summaries.map((s) => `${s.kind}:${s.ultNsu}`).join(","),
        maxNsu: null,
        cStat: summaries.map((s) => `${s.kind}:${s.cStat}`).join(","),
        xMotivo: summaries.map((s) => `${s.kind}:${s.xMotivo}`).join(" | "),
        finishedAt: new Date(),
      },
    });

    return { run: finished, summaries };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Falha na captura";
    const finished = await prisma.captureRun.update({
      where: { id: run.id },
      data: {
        status: "FAILED",
        errorMessage: message,
        finishedAt: new Date(),
      },
    });
    return { run: finished, error: message, status: 502 as const };
  }
}
