import { prisma } from "@/lib/db";
import { onlyDigits } from "@/lib/crypto-secret";
import { decodeCreds } from "@/lib/integrations";
import { loginProContador } from "@/lib/integrations/procontador";
import { ssrfSafeDispatcher } from "@/lib/ssrf-guard";
import { fetchWithTimeout } from "@/lib/fetch-timeout";
import { saveXmlFile } from "@/lib/sefaz/cert-store";

/**
 * O OS consome a captura do ProContador (SaaS) em vez de falar com a SEFAZ.
 *
 * POR QUE
 *
 * Os dois sistemas guardavam o certificado A1 do mesmo cliente e consultavam o
 * mesmo DistDFe, cada um com seu cursor NSU e sua própria guarda de "consumo
 * indevido", sem enxergar o outro. Com o mesmo CNPJ nos dois:
 *
 *  - consulta paralela vira cStat 656 e bloqueia o CNPJ por uma hora, e cada
 *    sistema culpa a SEFAZ porque não sabe que o outro consultou;
 *  - pior, cada um avança o próprio cursor NSU. Um pode consumir o NSU que o
 *    outro ainda não gravou, e o documento fiscal some sem erro aparente. Esse
 *    é o tipo de falha que só aparece na conferência do fechamento.
 *
 * O SaaS é o dono natural: já tem manifestação do destinatário (210210), que é
 * o passo sem o qual não existe XML completo de nota de entrada, além de
 * emissão, DANFE, cancelamento, agendador e testes.
 *
 * O QUE ESTE MÓDULO FAZ
 *
 * Dispara o sync no SaaS, lê as capturas pela API e importa para o XmlDocument
 * do OS, baixando o XML de cada documento novo. O OS continua sendo a tela do
 * escritório (fila, SLA, guias, portal do cliente); só deixou de ser um segundo
 * motor fiscal.
 */

type CaptureRow = {
  id?: string;
  doc_type?: string;
  chave?: string;
  direcao?: string | null;
  emitente_cnpj?: string | null;
  destinatario_cnpj?: string | null;
  valor_total?: string | number | null;
  data_emissao?: string | null;
  captured_at?: string | null;
};

/** doc_type do SaaS -> docType do OS (a auditoria depende dessa distinção). */
function mapDocType(raw?: string, chave?: string): string {
  const v = (raw ?? "").toLowerCase();
  if (v.includes("nfse")) return "NFSE";
  if (v.includes("cte")) return "CTE";
  if (v.includes("evento")) return "EVENT";
  // Sem chave de 44 dígitos o documento é resumo (resNFe): não tem itens nem
  // destinatário, e a auditoria precisa saber disso para não reprovar.
  if (v.includes("resumo") || onlyDigits(chave ?? "").length !== 44) {
    return v.includes("nfe") || !v ? "RESUMO" : "NFE";
  }
  return "NFE";
}

function toCents(value: string | number | null | undefined): number | null {
  if (value == null) return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? Math.round(n * 100) : null;
}

async function resolveCompanyId(client: {
  procontadorCompanyId: string | null;
  cnpj: string;
}, ctx: { baseUrl: string; accessToken: string }): Promise<string | null> {
  if (client.procontadorCompanyId) return client.procontadorCompanyId;

  // Fallback: o cliente foi cadastrado à mão no OS, sem passar pelo sync.
  // Procura pelo CNPJ e devolve o id, sem gravar (quem grava é o sync).
  const res = await fetchWithTimeout(
    `${ctx.baseUrl}/companies?page=1&limit=100`,
    {
      headers: {
        Authorization: `Bearer ${ctx.accessToken}`,
        Accept: "application/json",
      },
    },
    15_000,
    ssrfSafeDispatcher(),
  );
  const json = (await res.json().catch(() => null)) as {
    data?: Array<{ id?: string; cnpj?: string }>;
  } | null;
  const alvo = onlyDigits(client.cnpj);
  return (
    json?.data?.find((c) => onlyDigits(c.cnpj ?? "") === alvo)?.id ?? null
  );
}

export async function syncFiscalFromProContador(opts: {
  firmId: string;
  clientId: string;
  userId?: string;
  /** Dispara a captura no SaaS antes de ler. Falso = só importa o que já existe. */
  disparaSync?: boolean;
}) {
  const client = await prisma.client.findFirst({
    where: { id: opts.clientId, firmId: opts.firmId },
  });
  if (!client) return { error: "Cliente não encontrado", status: 404 as const };

  const integration = await prisma.integration.findUnique({
    where: { firmId_provider: { firmId: opts.firmId, provider: "PROCONTADOR" } },
  });
  const creds = decodeCreds(integration?.credentialsEnc);
  if (!creds.email || !creds.password) {
    return {
      error:
        "ProContador não conectado. A captura e o certificado A1 vivem lá — conecte em Integrações → ProContador.",
      status: 400 as const,
    };
  }

  const run = await prisma.captureRun.create({
    data: {
      firmId: opts.firmId,
      clientId: client.id,
      userId: opts.userId ?? null,
      mode: "PROCONTADOR_API",
      kindsJson: JSON.stringify(["NFE", "NFSE"]),
      status: "RUNNING",
    },
  });

  try {
    const { accessToken, baseUrl } = await loginProContador({
      baseUrl: creds.baseUrl,
      email: creds.email,
      password: creds.password,
    });

    const companyId = await resolveCompanyId(client, { baseUrl, accessToken });
    if (!companyId) {
      throw new Error(
        `Cliente ${client.cnpj} não encontrado no ProContador. Cadastre a empresa lá e rode o sync de clientes.`,
      );
    }

    const api = `${baseUrl}/companies/${companyId}/fiscal-capture`;
    const auth = {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    };

    // 1. Dispara a captura no dono do certificado. Erro aqui não interrompe:
    // ainda vale importar o que já foi capturado antes.
    let avisoSync: string | undefined;
    if (opts.disparaSync !== false) {
      const res = await fetchWithTimeout(
        `${api}/sync`,
        {
          method: "POST",
          headers: { ...auth, "Content-Type": "application/json" },
          body: JSON.stringify({ tipo: "all" }),
        },
        120_000,
        ssrfSafeDispatcher(),
      );
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as {
          error?: string;
          message?: string;
        } | null;
        avisoSync =
          j?.error ||
          j?.message ||
          `Sync no ProContador respondeu HTTP ${res.status}`;
      }
    }

    // 2. Lê as capturas e importa o que ainda não existe aqui.
    let page = 1;
    let importados = 0;
    let jaExistiam = 0;
    let semXml = 0;
    let total = 0;

    while (page <= 20) {
      const res = await fetchWithTimeout(
        `${api}/captures?page=${page}&limit=100`,
        { headers: auth },
        30_000,
        ssrfSafeDispatcher(),
      );
      const json = (await res.json().catch(() => null)) as {
        data?: CaptureRow[];
        total?: number;
        error?: string;
        message?: string;
      } | null;
      if (!res.ok) {
        throw new Error(
          json?.message || json?.error || `GET /captures HTTP ${res.status}`,
        );
      }

      const lista = json?.data ?? [];
      total = Number(json?.total ?? lista.length);
      if (lista.length === 0) break;

      for (const row of lista) {
        const chave = (row.chave ?? "").trim();
        if (!chave) continue;
        const docType = mapDocType(row.doc_type, chave);
        // Mesmo formato de chave da captura local, para o histórico dos dois
        // períodos conviver sem duplicar documento.
        const scopedKey = `${docType === "NFSE" ? "NFSE" : "NFE"}:${chave}`.slice(0, 60);

        const existente = await prisma.xmlDocument.findFirst({
          where: { firmId: opts.firmId, accessKey: scopedKey },
          select: { id: true },
        });
        if (existente) {
          jaExistiam += 1;
          continue;
        }

        // 3. Baixa o XML. Sem conteúdo o registro não entra: documento fiscal
        // sem XML é só um aviso de que a nota existe, e entrava aqui como se
        // fosse o documento.
        let xml: string | null = null;
        if (row.id) {
          const xmlRes = await fetchWithTimeout(
            `${api}/captures/${row.id}/xml`,
            { headers: { Authorization: `Bearer ${accessToken}` } },
            30_000,
            ssrfSafeDispatcher(),
          );
          if (xmlRes.ok) xml = await xmlRes.text();
        }
        if (!xml) {
          semXml += 1;
          continue;
        }

        let rawPath: string | null = null;
        try {
          rawPath = await saveXmlFile(opts.firmId, client.id, chave, xml);
        } catch {
          rawPath = null;
        }

        await prisma.xmlDocument.create({
          data: {
            firmId: opts.firmId,
            clientId: client.id,
            accessKey: scopedKey,
            docType,
            direction: row.direcao === "saida" ? "OUT" : "IN",
            issuerCnpj: row.emitente_cnpj ?? null,
            recipientCnpj: row.destinatario_cnpj ?? null,
            issuedAt: row.data_emissao ? new Date(row.data_emissao) : null,
            amountCents: toCents(row.valor_total),
            status: "CAPTURED",
            rawPath,
            schemaSource: "PROCONTADOR_API",
          },
        });
        importados += 1;
      }

      if (lista.length < 100) break;
      page += 1;
    }

    await prisma.fiscalPipeline.updateMany({
      where: { firmId: opts.firmId, clientId: client.id, stage: "CAPTURE" },
      data: { stage: "AUDIT", stageStatus: "NEEDS_APPROVAL" },
    });

    const resumo =
      `ProContador: ${importados} novo(s), ${jaExistiam} já importado(s)` +
      (semXml > 0
        ? `, ${semXml} sem XML completo (pendente de manifestação lá)`
        : "");

    const finished = await prisma.captureRun.update({
      where: { id: run.id },
      data: {
        status: "DONE",
        docsFound: total,
        docsSaved: importados,
        xMotivo: resumo,
        errorMessage: avisoSync ?? null,
        finishedAt: new Date(),
      },
    });

    return { run: finished, message: resumo, warning: avisoSync };
  } catch (e) {
    const message =
      e instanceof Error ? e.message : "Falha ao consultar o ProContador";
    const finished = await prisma.captureRun.update({
      where: { id: run.id },
      data: { status: "FAILED", errorMessage: message, finishedAt: new Date() },
    });
    return { run: finished, error: message, status: 502 as const };
  }
}
