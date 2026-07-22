import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  await prisma.payment.deleteMany();
  await prisma.captureRun.deleteMany();
  await prisma.certificate.deleteMany();
  await prisma.delivery.deleteMany();
  await prisma.fiscalPipeline.deleteMany();
  await prisma.obligation.deleteMany();
  await prisma.xmlDocument.deleteMany();
  await prisma.task.deleteMany();
  await prisma.processTemplate.deleteMany();
  await prisma.user.deleteMany();
  await prisma.client.deleteMany();
  await prisma.firm.deleteMany();

  const passwordHash = await bcrypt.hash("hub123", 10);

  const firm = await prisma.firm.create({
    data: {
      name: "Trust Contabilidade Demo",
      slug: "trust-demo",
      brandName: "Trust Contabilidade",
      brandTagline: "Seu escritório no bolso",
      users: {
        create: [
          {
            email: "owner@trust.demo",
            name: "Ana Owner",
            role: "OWNER",
            passwordHash,
          },
          {
            email: "fiscal@trust.demo",
            name: "Bruno Fiscal",
            role: "STAFF",
            passwordHash,
          },
        ],
      },
    },
    include: { users: true },
  });

  const fiscal = firm.users.find((u) => u.role === "STAFF")!;

  const clients = await Promise.all([
    prisma.client.create({
      data: {
        firmId: firm.id,
        legalName: "Alpha Comércio LTDA",
        tradeName: "Alpha Store",
        cnpj: "12.345.678/0001-90",
        regime: "SIMPLES",
        whatsapp: "5511999990001",
        email: "financeiro@alpha.demo",
      },
    }),
    prisma.client.create({
      data: {
        firmId: firm.id,
        legalName: "Beta Serviços ME",
        tradeName: "Beta Tech",
        cnpj: "98.765.432/0001-10",
        regime: "SIMPLES",
        whatsapp: "5511999990002",
        email: "contato@beta.demo",
      },
    }),
    prisma.client.create({
      data: {
        firmId: firm.id,
        legalName: "Gamma Indústria SA",
        tradeName: "Gamma",
        cnpj: "11.222.333/0001-44",
        regime: "LUCRO_PRESUMIDO",
        email: "fiscal@gamma.demo",
      },
    }),
  ]);

  const dasTemplate = await prisma.processTemplate.create({
    data: {
      firmId: firm.id,
      name: "DAS Simples Nacional",
      code: "DAS_SN",
      department: "FISCAL",
      regimeScope: "SIMPLES",
      recurring: true,
      dayOfMonth: 20,
      stepsJson: JSON.stringify([
        { key: "CAPTURE", label: "Capturar XMLs do mês" },
        { key: "AUDIT", label: "Auditar inconsistências" },
        { key: "APURATE", label: "Apurar DAS (assistido)" },
        { key: "GUIDE", label: "Gerar e enviar guia" },
        { key: "PAY", label: "Acompanhar pagamento" },
        { key: "PROVE", label: "Anexar comprovante" },
        { key: "CLOSE", label: "Fechar tarefa" },
      ]),
    },
  });

  const competence = "2026-06";
  const dueAt = new Date("2026-07-20T23:59:59");

  for (const client of clients.filter((c) => c.regime === "SIMPLES")) {
    const task = await prisma.task.create({
      data: {
        firmId: firm.id,
        clientId: client.id,
        templateId: dasTemplate.id,
        assigneeId: fiscal.id,
        title: `DAS ${competence} — ${client.tradeName ?? client.legalName}`,
        description:
          "Pipeline Fiscal Autopilot: captura → audita → apura → guia → paga → prova → fecha",
        status: "IN_PROGRESS",
        priority: "HIGH",
        department: "FISCAL",
        dueAt,
      },
    });

    await prisma.obligation.create({
      data: {
        firmId: firm.id,
        clientId: client.id,
        taskId: task.id,
        type: "DAS",
        competence,
        amountCents: client.tradeName === "Alpha Store" ? 184750 : 92340,
        status: client.tradeName === "Alpha Store" ? "SENT" : "READY",
        dueAt,
        sentAt: client.tradeName === "Alpha Store" ? new Date() : null,
        sourcePortal: "e-CAC",
      },
    });

    await prisma.fiscalPipeline.create({
      data: {
        firmId: firm.id,
        clientId: client.id,
        taskId: task.id,
        obligationType: "DAS",
        competence,
        stage: client.tradeName === "Alpha Store" ? "PAY" : "GUIDE",
        stageStatus: "NEEDS_APPROVAL",
        metaJson: JSON.stringify({
          benchmarkSources: ["HubStrom", "Jettax", "Dootax", "Karbon", "Qive"],
          pilot: true,
        }),
      },
    });

    await prisma.xmlDocument.createMany({
      data: [
        {
          firmId: firm.id,
          clientId: client.id,
          accessKey: `${client.cnpj.replace(/\D/g, "").slice(0, 8)}35260600000000000000000000000000000000000001`,
          docType: "NFE",
          direction: "OUT",
          issuerCnpj: client.cnpj,
          amountCents: 450000,
          status: "OK",
          issuedAt: new Date("2026-06-12"),
        },
        {
          firmId: firm.id,
          clientId: client.id,
          accessKey: `${client.cnpj.replace(/\D/g, "").slice(0, 8)}35260600000000000000000000000000000000000002`,
          docType: "NFE",
          direction: "IN",
          recipientCnpj: client.cnpj,
          amountCents: 128900,
          status: "WARNING",
          auditJson: JSON.stringify([
            { code: "CFOP_MISMATCH", severity: "WARNING", message: "CFOP inconsistente com CST" },
          ]),
          issuedAt: new Date("2026-06-18"),
        },
      ],
    });
  }

  await prisma.task.create({
    data: {
      firmId: firm.id,
      clientId: clients[2].id,
      assigneeId: fiscal.id,
      title: "CND Federal — Gamma",
      status: "PENDING",
      priority: "NORMAL",
      department: "FISCAL",
      dueAt: new Date("2026-07-25"),
    },
  });

  await prisma.user.create({
    data: {
      firmId: firm.id,
      clientId: clients[0].id,
      email: "financeiro@alpha.demo",
      name: "Financeiro Alpha",
      role: "CLIENT",
      passwordHash,
    },
  });

  console.log("Seed OK — firm:", firm.slug);
  console.log("Escritório: owner@trust.demo / hub123");
  console.log("Portal cliente: financeiro@alpha.demo / hub123 → /portal");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
