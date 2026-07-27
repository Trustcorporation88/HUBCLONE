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
}): Promise<{ saved: number; failed: number }> {
  let saved = 0;
  let failed = 0;
  for (const doc of opts.result.docs) {
    // Sem chave de acesso real, usa o NSU (único e monotônico por certificado)
    // como identificador — evita colisão de dois docs capturados no mesmo
    // milissegundo (o antigo Date.now() colidia e descartava documentos).
    const accessKey =
      doc.accessKey ??
      `${opts.kind}-NSU${String(doc.nsu)}`.padEnd(44, "0").slice(0, 44);
    const scopedKey = `${opts.kind}:${accessKey}`.slice(0, 60);

    // Idempotência explícita: se já existe (recaptura), conta como salvo (não é
    // falha) e segue. Assim só erros REAIS de gravação contam como `failed`.
    const already = await prisma.xmlDocument.findFirst({
      where: { firmId: opts.firmId, accessKey: scopedKey },
      select: { id: true },
    });
    if (already) {
      saved += 1;
      continue;
    }

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
          accessKey: scopedKey,
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
      // Erro real de gravação (não duplicata, pois já checamos acima).
      // Conta como falha para NÃO avançar o NSU e reprocessar na próxima rodada.
      failed += 1;
    }
  }
  return { saved, failed };
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

  // NFS-e usa hosts oficiais do ADN por padrão (adn.nfse.gov.br), sem exigir
  // configuração — NFSE_ADN_BASE_URL/NFSE_ADN_BASE_URL_HOM só servem para
  // sobrescrever em casos especiais (ver nfse-adn.ts).
  const effectiveKinds = kinds;
  if (!effectiveKinds.length) {
    return {
      error: "Selecione ao menos NF-e, CT-e ou NFS-e.",
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

    // O DistDFe entrega no máximo ~50 documentos por chamada. É preciso
    // paginar (repetir com o ultNsu retornado) até esgotar o backlog
    // (ultNsu >= maxNsu). MAX_PAGES é um teto de segurança contra loop infinito.
    const MAX_PAGES = 50;

    for (const kind of effectiveKinds) {
      try {
        let result: DistDfeResult;
        let pages = 0;
        let backlogRemaining = false;

        // NFS-e (ADN) não usa o mesmo esquema de NSU/maxNSU do DistDFe — chamada única.
        if (kind === "NFSE") {
          result = await nfseAdnLive({
            cnpj,
            tpAmb,
            ultNsu: cert.lastNsuNfse,
            tls,
          });
          docsFound += result.docs.length;
          const nfseSave = await saveDocs({
            firmId: opts.firmId,
            clientId: client.id,
            kind,
            result,
          });
          docsSaved += nfseSave.saved;
          // Só avança o cursor NSU se TODOS os documentos foram gravados —
          // uma falha real de gravação deixaria doc fiscal para trás se
          // avançássemos o NSU mesmo assim.
          if (classifySefazStat(result.cStat).ok && nfseSave.failed === 0) {
            await prisma.certificate.update({
              where: { id: cert.id },
              data: { lastNsuNfse: result.ultNsu },
            });
          } else if (nfseSave.failed > 0) {
            failures.push(
              `${kind}: ${nfseSave.failed} documento(s) não gravado(s) — cursor NSU mantido para reprocessar.`,
            );
          }
        } else {
          let currentNsu = kind === "NFE" ? cert.lastNsu : cert.lastNsuCte;
          let lastResult: DistDfeResult | null = null;

          do {
            const pageResult =
              kind === "NFE"
                ? await distDfeLive({ cnpj, tpAmb, ultNsu: currentNsu, tls })
                : await cteDistDfeLive({ cnpj, tpAmb, ultNsu: currentNsu, tls });

            lastResult = pageResult;
            pages += 1;

            if (!classifySefazStat(pageResult.cStat).ok) break;

            docsFound += pageResult.docs.length;
            const pageSave = await saveDocs({
              firmId: opts.firmId,
              clientId: client.id,
              kind,
              result: pageResult,
            });
            docsSaved += pageSave.saved;

            // Se algum documento desta página falhou ao gravar por erro REAL
            // (não duplicata), NÃO avança o cursor: para o loop e mantém o NSU
            // para reprocessar do ponto certo na próxima execução — evita
            // perder documento fiscal permanentemente.
            if (pageSave.failed > 0) {
              failures.push(
                `${kind}: ${pageSave.failed} documento(s) não gravado(s) na página ${pages} — cursor NSU mantido para reprocessar.`,
              );
              break;
            }

            await prisma.certificate.update({
              where: { id: cert.id },
              data:
                kind === "NFE"
                  ? { lastNsu: pageResult.ultNsu }
                  : { lastNsuCte: pageResult.ultNsu },
            });

            // Proteção contra estagnação: se o NSU não avançou, para (evita
            // repetir a mesma página indefinidamente por bug do WS).
            if (pageResult.ultNsu === currentNsu) break;
            currentNsu = pageResult.ultNsu;
            const ult = Number(pageResult.ultNsu);
            const max = Number(pageResult.maxNsu);
            backlogRemaining =
              Number.isFinite(ult) && Number.isFinite(max) && ult < max;
          } while (backlogRemaining && pages < MAX_PAGES);

          result = lastResult!;
        }

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
        } else if (backlogRemaining && pages >= MAX_PAGES) {
          // Não deixa passar silenciosamente que ainda há documentos pendentes.
          failures.push(
            `${kind}: backlog parcial — ${pages} páginas capturadas nesta execução, ainda há documentos pendentes na SEFAZ. Rode a captura novamente.`,
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
