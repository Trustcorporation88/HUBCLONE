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

  if (doc.amountCents == null || doc.amountCents <= 0) {
    findings.push({
      severity: "WARNING",
      code: "ZERO_AMOUNT",
      message: "Documento sem valor ou valor zerado",
      blocking: true,
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
      findings.push({
        severity: "ERROR",
        code: "CNPJ_MISMATCH",
        message: "CNPJ do cliente não aparece como emitente nem destinatário",
        blocking: true,
      });
    }
  }

  if (doc.docType === "NFE" && doc.accessKey.replace(/\D/g, "").length !== 44) {
    findings.push({
      severity: "ERROR",
      code: "INVALID_KEY",
      message: "Chave de acesso NF-e inválida (esperado 44 dígitos)",
      blocking: true,
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
