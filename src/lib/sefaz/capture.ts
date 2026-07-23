import { prisma } from "@/lib/db";
import { decryptSecret, onlyDigits } from "@/lib/crypto-secret";
import { loadCertificateTls, saveXmlFile } from "@/lib/sefaz/cert-store";
import { distDfeLive, type DistDfeResult } from "@/lib/sefaz/dist-dfe";
import { cteDistDfeLive } from "@/lib/sefaz/cte-dist-dfe";
import { nfseAdnLive } from "@/lib/sefaz/nfse-adn";
import { mapTlsError } from "@/lib/sefaz/pfx-tls";
import {
  classifySefazStat,
  formatCaptureSummary,
} from "@/lib/sefaz/sefaz-status";

export type CaptureKind = "NFE" | "CTE" | "NFSE";

const DOC_TYPE: Record<CaptureKind, string> = {
  NFE: "NFE",
  CTE: "CTE",
  NFSE: "NFSE",
};

const SOURCE: Record<CaptureKind, string> = {
  NFE: "SEFAZ_DISTDFE",
  CTE: "CTE_DISTDFE",
  NFSE: "NFSE_ADN",
};

async function saveDocs(opts: {
  firmId: string;
  clientId: string;
  kind: CaptureKind;
  result: DistDfeResult;
}) {
  let saved = 0;
  for (const doc of opts.result.docs) {
    const accessKey =
      doc.accessKey ??
      `${opts.kind}-${doc.nsu}-${Date.now()}`.padEnd(44, "0").slice(0, 44);

    let rawPath: string | null = null;
    try {
      rawPath = await saveXmlFile(
        opts.firmId,
        opts.clientId,
        `${opts.kind}-${accessKey}`,
        doc.xml,
      );
    } catch {
      rawPath = null;
    }

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
          schemaSource: SOURCE[opts.kind],
        },
      });
      saved += 1;
    } catch {
      // duplicate access key
    }
  }
  return saved;
}

/** Captura 100% live — exige certificado A1 do cliente. Sem mock. */
export async function runXmlCapture(opts: {
  firmId: string;
  clientId: string;
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

  if (!cert) {
    return {
      error:
        "Certificado A1 obrigatório para captura. Cadastre o .pfx do cliente antes de capturar.",
      status: 400 as const,
    };
  }

  if (!cert.pfxEnc && !cert.pemKeyEnc) {
    return {
      error:
        "Este certificado precisa ser cadastrado de novo (versão antiga sem arquivo no banco). Envie o .pfx novamente.",
      status: 400 as const,
    };
  }

  const effectiveKinds = kinds.filter((k) => {
    if (k === "NFSE" && !process.env.NFSE_ADN_BASE_URL?.trim()) return false;
    return true;
  });
  if (!effectiveKinds.length) {
    return {
      error:
        kinds.includes("NFSE") && !process.env.NFSE_ADN_BASE_URL?.trim()
          ? "NFS-e exige NFSE_ADN_BASE_URL. Marque NF-e/CT-e ou configure a URL do ADN."
          : "Selecione ao menos NF-e ou CT-e.",
      status: 400 as const,
    };
  }

  const run = await prisma.captureRun.create({
    data: {
      firmId: opts.firmId,
      clientId: client.id,
      certificateId: cert.id,
      mode: "LIVE",
      kindsJson: JSON.stringify(effectiveKinds),
      status: "RUNNING",
    },
  });

  try {
    const cnpj = onlyDigits(cert.cnpj);
    const tpAmb = (cert.environment === "1" ? "1" : "2") as "1" | "2";
    const passphrase = decryptSecret(cert.passwordEnc);
    const tls = await loadCertificateTls(cert, passphrase);

    let docsFound = 0;
    let docsSaved = 0;
    const summaries: Array<{
      kind: CaptureKind;
      cStat: string;
      xMotivo: string;
      ultNsu: string;
    }> = [];
    const failures: string[] = [];

    for (const kind of effectiveKinds) {
      try {
        let result: DistDfeResult;

        if (kind === "NFE") {
          result = await distDfeLive({
            cnpj,
            tpAmb,
            ultNsu: cert.lastNsu,
            tls,
          });
          if (classifySefazStat(result.cStat).ok) {
            await prisma.certificate.update({
              where: { id: cert.id },
              data: { lastNsu: result.ultNsu },
            });
          }
        } else if (kind === "CTE") {
          result = await cteDistDfeLive({
            cnpj,
            tpAmb,
            ultNsu: cert.lastNsuCte,
            tls,
          });
          if (classifySefazStat(result.cStat).ok) {
            await prisma.certificate.update({
              where: { id: cert.id },
              data: { lastNsuCte: result.ultNsu },
            });
          }
        } else {
          result = await nfseAdnLive({
            cnpj,
            ultNsu: cert.lastNsuNfse,
            tls,
          });
          if (classifySefazStat(result.cStat).ok) {
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
        });
        summaries.push({
          kind,
          cStat: result.cStat,
          xMotivo: result.xMotivo,
          ultNsu: result.ultNsu,
        });
        if (!classifySefazStat(result.cStat).ok) {
          const cls = classifySefazStat(result.cStat);
          failures.push(
            `${kind}: ${cls.label}${result.xMotivo ? ` — ${result.xMotivo}` : ""}`,
          );
        }
      } catch (kindErr) {
        const message = mapTlsError(kindErr);
        failures.push(`${kind}: ${message}`);
        summaries.push({
          kind,
          cStat: "ERR",
          xMotivo: message,
          ultNsu: "000000000000000",
        });
      }
    }

    const allFailed =
      summaries.length > 0 &&
      summaries.every((s) => !classifySefazStat(s.cStat).ok);

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
        status: allFailed ? "FAILED" : "DONE",
        docsFound,
        docsSaved,
        ultNsu: summaries.map((s) => `${s.kind}:${s.ultNsu}`).join(","),
        cStat: summaries.map((s) => `${s.kind}:${s.cStat}`).join(","),
        xMotivo: summaries.map((s) => `${s.kind}:${s.xMotivo}`).join(" | "),
        errorMessage: failures.length ? failures.join(" | ") : null,
        finishedAt: new Date(),
      },
    });

    if (allFailed) {
      return {
        run: finished,
        error: formatCaptureSummary(summaries) || "Falha na captura",
        status: 502 as const,
      };
    }

    return {
      run: finished,
      summaries,
      message: formatCaptureSummary(summaries),
      warning: failures.length ? failures.join(" | ") : undefined,
    };
  } catch (e) {
    const message = mapTlsError(e);
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
