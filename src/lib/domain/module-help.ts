export type ModuleHelp = {
  href: string;
  nav: string;
  title: string;
  summary: string;
  forWhom: string;
  howToStart: string[];
  tips: string[];
};

/** Guia operacional para o contador — o que cada serviço do OS faz. */
export const MODULE_HELP: ModuleHelp[] = [
  {
    href: "/app",
    nav: "Painel",
    title: "Painel geral",
    summary:
      "Visão do escritório: clientes ativos, pendências fiscais (PGDAS, DAS, DCTF, FGTS, CND), certificados, XML e Autopilot.",
    forWhom: "Sócio / coordenador fiscal — começar o dia aqui.",
    howToStart: [
      "Depois de importar clientes (ProContador/Omie/CSV), o contador de clientes sobe.",
      "As barras de pendência só enchem quando houver obrigações cadastradas em Guias.",
      "Certificados e XML mudam após configurar A1 e rodar captura.",
    ],
    tips: [
      "Zero em tudo após importar clientes é normal — cadastro ≠ obrigação.",
    ],
  },
  {
    href: "/app/tasks",
    nav: "Tarefas",
    title: "Tarefas",
    summary:
      "Fila de trabalho do escritório: o que fazer, para qual cliente, prazo e status (estilo practice management).",
    forWhom: "Equipe fiscal, contábil, DP e atendimento.",
    howToStart: [
      "Abra Tarefas e filtre por status ou cliente.",
      "Use o Painel/Autopilot para gerar fluxo; tarefas acompanham o fechamento.",
    ],
    tips: ["Atrasadas devem aparecer também na Fila (capacidade)."],
  },
  {
    href: "/app/capacity",
    nav: "Fila",
    title: "Capacidade e fila",
    summary:
      "Mostra carga por setor: abertas, atrasadas e sem responsável — para equilibrar a equipe.",
    forWhom: "Coordenador / owner.",
    howToStart: [
      "Revise atrasadas e redistribua assignees.",
      "Combine com P&L para ver clientes que consomem mais horas.",
    ],
    tips: ["Sem tarefas cadastradas a fila fica zerada."],
  },
  {
    href: "/app/pnl",
    nav: "P&L",
    title: "P&L interno",
    summary:
      "Margem e horas por cliente: quanto o escritório gasta de tempo versus o valor do contrato.",
    forWhom: "Sócio / controller do escritório.",
    howToStart: [
      "Lance time entries (horas) nos clientes.",
      "Compare clientes que dão prejuízo de capacidade.",
    ],
    tips: ["Não substitui ERP financeiro — é P&L operacional do escritório."],
  },
  {
    href: "/app/sla",
    nav: "SLA",
    title: "SLA WhatsApp / e-mail",
    summary:
      "Políticas de prazo para envio de guias e acompanhamento on-time vs atrasado.",
    forWhom: "Atendimento e fiscal.",
    howToStart: [
      "Defina a política de SLA do escritório.",
      "Envie guias por e-mail (SMTP) e acompanhe o monitor.",
    ],
    tips: ["WhatsApp no OS é manual (download + wa.me) — sem API fictícia."],
  },
  {
    href: "/app/obligations",
    nav: "Guias",
    title: "Guias e obrigações",
    summary:
      "Cadastro de obrigações (PGDAS, DAS, DCTF, FGTS, etc.), envio ao cliente, PIX/boleto oficiais e comprovante.",
    forWhom: "Fiscal do dia a dia.",
    howToStart: [
      "Escolha um cliente importado.",
      "Cadastre a obrigação do período (tipo + vencimento).",
      "Anexe código de barras/PIX real e envie por e-mail quando SMTP estiver ok.",
    ],
    tips: [
      "Sem obrigação cadastrada o Painel continua em zero nas pendências.",
      "Nunca invente PIX — só payload oficial.",
    ],
  },
  {
    href: "/app/xml",
    nav: "XML",
    title: "XML compra e venda",
    summary:
      "Captura live de NF-e/CT-e (DistDFe) e NFS-e (ADN) com certificado A1 do cliente. Auditoria de XML.",
    forWhom: "Fiscal / escrituração.",
    howToStart: [
      "Cadastre o certificado A1 do cliente (arquivo + senha).",
      "Rode a captura — sem mock: precisa de credencial real.",
      "Revise alertas e erros no painel XML.",
    ],
    tips: ["Sem A1 válido a captura falha de propósito (zero mock)."],
  },
  {
    href: "/app/pipeline",
    nav: "Autopilot",
    title: "Fiscal Autopilot",
    summary:
      "Pipeline ponta a ponta: captura → auditoria → apuração → guia → pagamento → prova → fecha tarefa.",
    forWhom: "Escritório que quer fechar obrigação inteira, não só pedaços.",
    howToStart: [
      "Tenha cliente + XML/obrigação mínimos.",
      "Acompanhe estágios vivos no Autopilot.",
      "Bloqueios (ex.: XML com finding) aparecem antes de avançar.",
    ],
    tips: ["É o diferencial vs HubStrom: fecha o ciclo, não só monitora."],
  },
  {
    href: "/app/contracts",
    nav: "Contratos",
    title: "Contratos / OS",
    summary:
      "Pedido de assinatura e PDF assinado disponível no portal do cliente (ClickSign quando conectado).",
    forWhom: "Societário / atendimento comercial.",
    howToStart: [
      "Conecte ClickSign em Integrações (token real).",
      "Crie o pedido de assinatura e acompanhe no portal.",
    ],
    tips: ["Sem ClickSign o fluxo de assinatura eletrônica não completa."],
  },
  {
    href: "/app/inbox",
    nav: "Inbox",
    title: "Inbox inteligente",
    summary:
      "Upload de documentos: a OpenAI classifica (DAS, NF-e, contrato, comprovante, outros) para triagem.",
    forWhom: "Atendimento e fiscal.",
    howToStart: [
      "Conecte OpenAI em Integrações (ou OPENAI_API_KEY no Railway).",
      "Envie o arquivo e confira a classificação.",
    ],
    tips: ["Mesma chave serve para o Assistente (Ajuda)."],
  },
  {
    href: "/app/health",
    nav: "Saúde",
    title: "Saúde fiscal",
    summary:
      "Alertas consolidados: certificado vencendo, CND, guias vencidas, XML com erro.",
    forWhom: "Coordenador fiscal.",
    howToStart: [
      "Abra Saúde após ter clientes, certs e guias.",
      "Trate alertas vermelhos primeiro.",
    ],
    tips: ["Começa vazio até haver dados operacionais."],
  },
  {
    href: "/app/integrations",
    nav: "Integrações",
    title: "Marketplace de integrações",
    summary:
      "Conectores reais: ProContador (empresas), Omie, Domínio (CSV/API), ClickSign, OpenAI.",
    forWhom: "Owner / TI do escritório.",
    howToStart: [
      "ProContador: e-mail admin + senha + API Railway → Importar empresas.",
      "Omie: App Key/Secret → Importar clientes.",
      "Domínio: CSV agora; API parceiro quando houver token.",
      "OpenAI: cole a API key para Inbox e Assistente.",
    ],
    tips: [
      "API ProContador correta: contador-api-production.up.railway.app/api/v1",
      "Tutorial detalhado em Integrações → Ver tutorial.",
    ],
  },
  {
    href: "/app/knowledge",
    nav: "Benchmark",
    title: "Base de conhecimento (benchmark)",
    summary:
      "Por que cada capacidade existe: referências a HubStrom, Jettax, Qive, Karbon, TaxDome etc.",
    forWhom: "Owner / produto — posicionamento.",
    howToStart: ["Leia a tabela de steals e o pipeline × origem."],
    tips: ["Não é manual do contador — use Ajuda para o operacional."],
  },
];

export function moduleHelpAsSystemContext(): string {
  return MODULE_HELP.map(
    (m) =>
      `### ${m.nav} (${m.href})\n${m.title}\n${m.summary}\nPara quem: ${m.forWhom}\nComo começar:\n- ${m.howToStart.join("\n- ")}\nDicas:\n- ${m.tips.join("\n- ")}`,
  ).join("\n\n");
}
