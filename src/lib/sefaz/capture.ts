import { prisma } from "@/lib/db";
import { decryptSecret, onlyDigits } from "@/lib/crypto-secret";
import { readPfx, saveXmlFile } from "@/lib/sefaz/cert-store";
import { distDfeLive, distDfeMock } from "@/lib/sefaz/dist-dfe";

export async function runXmlCapture(opts: {
  firmId: string;
  clientId: string;
  forceMock?: boolean;
}) {
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
      status: "RUNNING",
    },
  });

  try {
    const cnpj = onlyDigits(cert?.cnpj ?? client.cnpj);
    const ultNsu = cert?.lastNsu ?? "000000000000000";

    const result = useLive && cert
      ? await distDfeLive({
          cnpj,
          tpAmb: (cert.environment === "1" ? "1" : "2") as "1" | "2",
          ultNsu,
          pfx: await readPfx(cert.pfxPath),
          passphrase: decryptSecret(cert.passwordEnc),
        })
      : distDfeMock({ cnpj, ultNsu });

    let saved = 0;
    for (const doc of result.docs) {
      if (doc.docType !== "NFE" || !doc.accessKey) continue;

      const rawPath = await saveXmlFile(
        opts.firmId,
        client.id,
        doc.accessKey,
        doc.xml,
      );

      try {
        await prisma.xmlDocument.create({
          data: {
            firmId: opts.firmId,
            clientId: client.id,
            accessKey: doc.accessKey,
            docType: "NFE",
            direction: doc.direction ?? "IN",
            issuerCnpj: doc.issuerCnpj,
            recipientCnpj: doc.recipientCnpj,
            issuedAt: doc.issuedAt,
            amountCents: doc.amountCents,
            status: "CAPTURED",
            rawPath,
            nsu: doc.nsu,
            schemaSource: useLive ? "SEFAZ_DISTDFE" : "MOCK",
          },
        });
        saved += 1;
      } catch {
        // unique accessKey — already captured
      }
    }

    if (cert) {
      await prisma.certificate.update({
        where: { id: cert.id },
        data: { lastNsu: result.ultNsu },
      });
    }

    // Mark related pipelines CAPTURE → AUDIT
    await prisma.fiscalPipeline.updateMany({
      where: {
        firmId: opts.firmId,
        clientId: client.id,
        stage: "CAPTURE",
      },
      data: { stage: "AUDIT", stageStatus: "NEEDS_APPROVAL" },
    });

    const okStats = ["137", "138"]; // 137=nenhum doc, 138=doc localizado
    const failed = useLive && !okStats.includes(result.cStat) && result.cStat !== "656";

    const finished = await prisma.captureRun.update({
      where: { id: run.id },
      data: {
        status: failed ? "FAILED" : "DONE",
        docsFound: result.docs.length,
        docsSaved: saved,
        ultNsu: result.ultNsu,
        maxNsu: result.maxNsu,
        cStat: result.cStat,
        xMotivo: result.xMotivo,
        errorMessage: failed ? result.xMotivo : null,
        finishedAt: new Date(),
      },
    });

    return { run: finished, result };
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
