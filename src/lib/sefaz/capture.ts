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

/**
 * Tipo gravado no XmlDocument. Para NF-e o DistDFe devolve tres coisas
 * diferentes no mesmo lote: o XML completo, o RESUMO (resNFe) e eventos.
 * Guardar essa distincao e o que permite a auditoria tratar cada um pelo que ele
 * e — e o que permite saber quais notas ainda precisam de manifestacao.
 */
function resolveDocType(kind: CaptureKind, detectado?: string): string {
  if (kind !== "NFE") return DOC_TYPE[kind];
  if (detectado === "RESUMO") return "RESUMO";
  if (detectado === "EVENT") return "EVENT";
  return "NFE";
}

const SOURCE: Record<CaptureKind, string> = {
  NFE: "SEFAZ_DISTDFE",
  CTE: "CTE_DISTDFE",
  NFSE: "NFSE_ADN",
};

// cStat 656 ("Consumo indevido") é a própria SEFAZ dizendo, por regra oficial
// (NT 2014.002 e NT do CT-e): "aguarde no mínimo 1h para consultar de novo se
// não houver documento novo". Não existe forma de contornar isso do lado do
// cliente — reenviar antes do prazo só reforça a rejeição. Por isso o app
// passa a bloquear a chamada localmente (sem nem tentar a SEFAZ de novo)
// até o prazo passar, e mostra a hora exata em que pode tentar de novo.
const THROTTLE_COOLDOWN_MS = 60 * 60 * 1000;

/**
 * Validade da trava de captura. Uma execucao real leva segundos; o teto existe
 * so para o caso de o processo morrer no meio e deixar a linha para tras. Trinta
 * minutos e folgado para a paginacao completa do DistDFe (MAX_PAGES) e curto o
 * bastante para nao deixar o cliente travado ate o dia seguinte.
 */
const CAPTURE_LOCK_TTL_MS = 30 * 60 * 1000;

/**
 * Toma a trava do certificado. Retorna false se ja existe uma captura viva.
 *
 * Duas operacoes, ambas atomicas no banco:
 *  1. `create` — vence quem chegar primeiro; a segunda recebe violacao de unique.
 *  2. `updateMany` com `expiresAt < agora` no WHERE — recupera trava orfa de um
 *     processo que morreu, e continua sendo um unico UPDATE, entao so uma
 *     replica consegue.
 */
async function acquireCaptureLock(
  certificateId: string,
  userId?: string,
): Promise<boolean> {
  const agora = new Date();
  const expiresAt = new Date(agora.getTime() + CAPTURE_LOCK_TTL_MS);
  try {
    await prisma.captureLock.create({
      data: { certificateId, expiresAt, lockedByUser: userId ?? null },
    });
    return true;
  } catch {
    const retomada = await prisma.captureLock.updateMany({
      where: { certificateId, expiresAt: { lt: agora } },
      data: { expiresAt, lockedAt: agora, lockedByUser: userId ?? null },
    });
    return retomada.count > 0;
  }
}

async function releaseCaptureLock(certificateId: string): Promise<void> {
  await prisma.captureLock
    .deleteMany({ where: { certificateId } })
    .catch(() => undefined);
}
const LOCAL_GUARD_MARKER = "Bloqueio local";

function parseKindValue(joined: string | null, kind: CaptureKind): string | null {
  if (!joined) return null;
  const sep = joined.includes("|") ? "|" : ",";
  for (const part of joined.split(sep)) {
    const idx = part.indexOf(":");
    if (idx === -1) continue;
    const k = part.slice(0, idx).trim();
    if (k === kind) return part.slice(idx + 1).trim();
  }
  return null;
}

function formatBrasilia(date: Date): string {
  return date.toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Olha as últimas capturas desse certificado e, se a última tentativa REAL
 * (não um bloqueio local anterior) desse `kind` voltou 656 há menos de 1h,
 * recusa a chamada aqui mesmo — sem gastar mais uma tentativa na SEFAZ.
 */
async function resolveThrottle(
  certificateId: string,
  kind: CaptureKind,
): Promise<{ blocked: true; retryAt: Date } | { blocked: false }> {
  const runs = await prisma.captureRun.findMany({
    where: { certificateId, status: { in: ["DONE", "FAILED"] } },
    orderBy: { startedAt: "desc" },
    take: 20,
    select: { cStat: true, xMotivo: true, finishedAt: true, startedAt: true },
  });

  for (const r of runs) {
    const stat = parseKindValue(r.cStat, kind);
    if (stat == null) continue; // esse kind não rodou nessa tentativa
    const motivo = parseKindValue(r.xMotivo, kind) ?? "";
    if (motivo.includes(LOCAL_GUARD_MARKER)) continue; // bloqueio local não conta como round-trip real
    if (stat !== "656") return { blocked: false };
    const ref = r.finishedAt ?? r.startedAt;
    const retryAt = new Date(ref.getTime() + THROTTLE_COOLDOWN_MS);
    return Date.now() < retryAt.getTime()
      ? { blocked: true, retryAt }
      : { blocked: false };
  }
  return { blocked: false };
}

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
          // Antes gravava sempre o "kind" (NFE/CTE/NFSE) e jogava fora o tipo
          // real que o parser identificou. Sem isso a auditoria nao consegue
          // distinguir XML completo de RESUMO (resNFe) ou de evento, e acabava
          // reprovando os dois casos mais comuns da captura.
          docType: resolveDocType(opts.kind, doc.docType),
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
  /** Quem disparou. Certificado A1 e assinatura do contribuinte: uso tem dono. */
  userId?: string;
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

  // TRAVA POR CERTIFICADO
  //
  // Nada impedia duas capturas simultaneas do mesmo certificado: dois cliques,
  // duas abas, dois funcionarios, ou a janela de deploy do Railway em que a
  // instancia nova sobe antes da antiga cair. A SEFAZ trata consulta paralela
  // como consumo indevido e responde 656, que bloqueia o CNPJ por UMA HORA. A
  // guarda de 656 que ja existe so age DEPOIS que a rejeicao chegou; esta trava
  // impede a rejeicao acontecer.
  //
  // A trava vive no banco (tabela CaptureLock), nao em memoria: vale entre
  // replicas. Nao usamos pg_advisory_lock porque ele e preso a SESSAO do
  // Postgres e o Prisma usa pool — o lock sairia numa conexao e o unlock em
  // outra, deixando o certificado travado ate a conexao ser reciclada.
  const locked = await acquireCaptureLock(cert.id, opts.userId);
  if (!locked) {
    return {
      error:
        "Ja existe uma captura em andamento para este certificado. Aguarde ela terminar — disparar em paralelo faz a SEFAZ bloquear o CNPJ por consumo indevido (cStat 656).",
      status: 409 as const,
    };
  }

  const run = await prisma.captureRun.create({
    data: {
      firmId: opts.firmId,
      clientId: client.id,
      certificateId: cert.id,
      userId: opts.userId ?? null,
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
      const throttle = await resolveThrottle(cert.id, kind);
      if (throttle.blocked) {
        const retryLabel = formatBrasilia(throttle.retryAt);
        const motivo =
          `${LOCAL_GUARD_MARKER}: a SEFAZ já rejeitou por "Consumo indevido" ` +
          `nesta última 1h. Para não piorar o bloqueio, não consultamos de novo ` +
          `antes de ${retryLabel} (horário de Brasília).`;
        failures.push(`${kind}: Consumo indevido — aguarde até ${retryLabel} (Brasília) — ${motivo}`);
        summaries.push({
          kind,
          cStat: "656",
          xMotivo: motivo,
          ultNsu:
            kind === "NFE"
              ? cert.lastNsu
              : kind === "CTE"
                ? cert.lastNsuCte
                : cert.lastNsuNfse,
        });
        continue;
      }

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
  } finally {
    // Solta a trava em qualquer saida (sucesso, rejeicao da SEFAZ ou excecao).
    // Se o processo morrer antes disso, a linha expira sozinha em
    // CAPTURE_LOCK_TTL_MS e a proxima captura a retoma.
    await releaseCaptureLock(cert.id);
  }
}
