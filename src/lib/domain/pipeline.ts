/** Pipeline stages — the moat no competitor fully joins end-to-end */
export const PIPELINE_STAGES = [
  "CAPTURE",
  "AUDIT",
  "APURATE",
  "GUIDE",
  "PAY",
  "PROVE",
  "CLOSE",
] as const;

export type PipelineStage = (typeof PIPELINE_STAGES)[number];

export const STAGE_LABELS: Record<PipelineStage, string> = {
  CAPTURE: "Capturar XMLs",
  AUDIT: "Auditar",
  APURATE: "Apurar",
  GUIDE: "Gerar guia",
  PAY: "Pagar / acompanhar",
  PROVE: "Comprovante",
  CLOSE: "Fechar tarefa",
};

export const STAGE_SOURCES: Record<PipelineStage, string> = {
  CAPTURE: "Qive / XMLHub",
  AUDIT: "BoxFiscal",
  APURATE: "Jettax",
  GUIDE: "HubStrom MonitorHub",
  PAY: "Dootax / Pag Útil",
  PROVE: "Dootax + Drive",
  CLOSE: "Karbon / TaskHub",
};

export function stageIndex(stage: string): number {
  const i = PIPELINE_STAGES.indexOf(stage as PipelineStage);
  return i < 0 ? 0 : i;
}

export function nextStage(stage: string): PipelineStage | null {
  const i = stageIndex(stage);
  if (i >= PIPELINE_STAGES.length - 1) return null;
  return PIPELINE_STAGES[i + 1];
}

export type BenchmarkSteal = {
  from: string;
  capability: string;
  why: string;
};

/** Knowledge base from competitive research — product DNA */
export const BENCHMARK_STEALS: BenchmarkSteal[] = [
  {
    from: "Jettax",
    capability: "Apuração assistida",
    why: "Calcula e sugere; humano aprova em 1 clique",
  },
  {
    from: "Qive",
    capability: "Captura nacional",
    why: "NSU contínuo sem depender do cliente",
  },
  {
    from: "Dootax/Pag Útil",
    capability: "Pagamento de guias",
    why: "Não só enviar — pagar + comprovante",
  },
  {
    from: "Confi",
    capability: "IA no WhatsApp",
    why: "Responde, envia doc e abre OS",
  },
  {
    from: "Karbon",
    capability: "Workflow engine",
    why: "Templates condicionais + capacidade",
  },
  {
    from: "TaxDome/Canopy",
    capability: "Client OS",
    why: "E-sign, propostas, cobrança, portal",
  },
  {
    from: "BoxFiscal",
    capability: "Auditoria pré-SPED",
    why: "Bloqueia fechamento inconsistente",
  },
  {
    from: "Pasta Contábil",
    capability: "Inbox inteligente",
    why: "Qualquer doc → IA classifica",
  },
];

export const OBLIGATION_TYPES = [
  "DAS",
  "DARF",
  "GPS",
  "DCTFWEB",
  "PGDAS",
  "CND",
  "FGTS",
  "ISS",
  "GNRE",
  "OTHER",
] as const;

export type ObligationType = (typeof OBLIGATION_TYPES)[number];
