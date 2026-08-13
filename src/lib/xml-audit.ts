import { prisma } from "@/lib/db";
import { onlyDigits } from "@/lib/crypto-secret";

export type AuditFindingInput = {
  severity: "INFO" | "WARNING" | "ERROR";
  code: string;
  message: string;
  blocking: boolean;
};

export function auditXmlDocument(doc: {
  accessKey: string;
  docType: string;
  direction: string;
  issuerCnpj: string | null;
  recipientCnpj: string | null;
  amountCents: number | null;
  status: string;
  clientCnpj: string;
}): AuditFindingInput[] {
  const findings: AuditFindingInput[] = [];
  const clientDigits = onlyDigits(doc.clientCnpj);

  // As regras abaixo foram escritas supondo XML COMPLETO (nfeProc, com <dest>).
  // Só que o DistDFe entrega, para nota emitida contra o cliente, o RESUMO
  // (resNFe): sem <dest>, sem itens, sem impostos. E entrega eventos, que por
  // natureza não têm valor. Com tudo bloqueante, os dois casos mais comuns da
  // captura travavam o pipeline em AUDIT de forma permanente.
  //
  // Agora o tipo do documento decide a severidade: falta de dado ESPERADA para
  // aquele tipo vira aviso, não bloqueio. O que continua bloqueando é
  // inconsistência de verdade (mesmo CNPJ nas duas pontas, documento marcado
  // com erro, chave malformada num XML completo).
  const ehResumo = doc.docType === "RESUMO";
  const ehEvento = doc.docType === "EVENT";
  const parcial = ehResumo || ehEvento;

  if (doc.amountCents == null || doc.amountCents <= 0) {
    findings.push({
      severity: parcial ? "INFO" : "WARNING",
      code: "ZERO_AMOUNT",
      message: ehEvento
        ? "Evento sem valor (esperado para procEvento)"
        : ehResumo
          ? "Resumo sem valor informado — confirme após baixar o XML completo"
          : "Documento sem valor ou valor zerado",
      blocking: !parcial,
    });
  }

  const issuer = onlyDigits(doc.issuerCnpj ?? "");
  const recipient = onlyDigits(doc.recipientCnpj ?? "");
  if (issuer && recipient && issuer === recipient) {
    findings.push({
      severity: "ERROR",
      code: "SAME_PARTY",
      message: "Emitente e destinatário com o mesmo CNPJ",
      blocking: true,
    });
  }

  if (clientDigits.length === 14) {
    const involved = [issuer, recipient].filter((c) => c.length === 14);
    if (involved.length > 0 && !involved.includes(clientDigits)) {
      // No resumo só vem o CNPJ do emitente (um terceiro), então "o CNPJ do
      // cliente não aparece" é o estado NORMAL de toda nota de entrada. Só é
      // divergência real quando o documento traz as duas pontas.
      const temAsDuasPontas = Boolean(issuer) && Boolean(recipient);
      findings.push({
        severity: temAsDuasPontas ? "ERROR" : "INFO",
        code: "CNPJ_MISMATCH",
        message: temAsDuasPontas
          ? "CNPJ do cliente não aparece como emitente nem destinatário"
          : "Documento parcial: só o emitente foi informado (destinatário vem no XML completo)",
        blocking: temAsDuasPontas,
      });
    }
  }

  // A chave sintética gerada na captura quando o documento não traz chNFe
  // (`NFE-NSU000...` completado com zeros) tem 37 dígitos, não 44 — a regra
  // antiga reprovava todo documento sem chave. Só validamos quando existe
  // chave de verdade e o documento é completo.
  const chaveDigits = doc.accessKey.replace(/\D/g, "");
  const chaveSintetica = /-NSU/i.test(doc.accessKey);
  if (doc.docType === "NFE" && !chaveSintetica && chaveDigits.length !== 44) {
    findings.push({
      severity: "ERROR",
      code: "INVALID_KEY",
      message: "Chave de acesso NF-e inválida (esperado 44 dígitos)",
      blocking: true,
    });
  }
  if (chaveSintetica) {
    findings.push({
      severity: "INFO",
      code: "NO_ACCESS_KEY",
      message: "Documento sem chave de acesso — identificado pelo NSU",
      blocking: false,
    });
  }

  if (ehResumo) {
    findings.push({
      severity: "WARNING",
      code: "RESUMO_SEM_XML_COMPLETO",
      message:
        "Só o resumo (resNFe) foi entregue pela SEFAZ. O XML completo exige manifestação do destinatário (evento 210210) e é o que permite escriturar.",
      blocking: false,
    });
  }

  if (doc.status === "ERROR") {
    findings.push({
      severity: "ERROR",
      code: "STATUS_ERROR",
      message: "Documento marcado com status ERROR",
      blocking: true,
    });
  }

  if (findings.length === 0) {
    findings.push({
      severity: "INFO",
      code: "OK",
      message: "Sem inconsistências bloqueantes",
      blocking: false,
    });
  }

  return findings;
}

export async function runXmlAuditForClient(opts: {
  firmId: string;
  clientId: string;
}) {
  const client = await prisma.client.findFirst({
    where: { id: opts.clientId, firmId: opts.firmId },
  });
  if (!client) return { error: "Cliente não encontrado", status: 404 as const };

  const docs = await prisma.xmlDocument.findMany({
    where: { firmId: opts.firmId, clientId: opts.clientId },
  });

  let findingsCount = 0;
  let blockingCount = 0;

  for (const doc of docs) {
    await prisma.xmlAuditFinding.deleteMany({
      where: { xmlDocumentId: doc.id },
    });

    const findings = auditXmlDocument({
      ...doc,
      clientCnpj: client.cnpj,
    });

    await prisma.xmlAuditFinding.createMany({
      data: findings.map((f) => ({
        firmId: opts.firmId,
        xmlDocumentId: doc.id,
        severity: f.severity,
        code: f.code,
        message: f.message,
        blocking: f.blocking,
      })),
    });

    findingsCount += findings.length;
    blockingCount += findings.filter((f) => f.blocking).length;

    const hasBlocking = findings.some((f) => f.blocking);
    const hasWarning = findings.some((f) => f.severity === "WARNING");
    await prisma.xmlDocument.update({
      where: { id: doc.id },
      data: {
        status: hasBlocking ? "ERROR" : hasWarning ? "WARNING" : "OK",
        auditJson: JSON.stringify(findings),
      },
    });
  }

  return { docs: docs.length, findingsCount, blockingCount };
}

export async function clientHasBlockingXml(opts: {
  firmId: string;
  clientId: string;
}) {
  const blocking = await prisma.xmlAuditFinding.count({
    where: {
      firmId: opts.firmId,
      blocking: true,
      xmlDocument: { clientId: opts.clientId },
    },
  });
  const errorDocs = await prisma.xmlDocument.count({
    where: {
      firmId: opts.firmId,
      clientId: opts.clientId,
      status: "ERROR",
    },
  });
  return blocking > 0 || errorDocs > 0;
}
