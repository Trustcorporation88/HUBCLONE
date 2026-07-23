/** Classifica retorno DistDFe / ADN para a UI — 137/138 não são erro. */
export function classifySefazStat(cStat: string): {
  ok: boolean;
  empty: boolean;
  label: string;
} {
  const code = String(cStat).replace(/\D/g, "");
  if (code === "137") {
    return { ok: true, empty: true, label: "Nenhum documento novo" };
  }
  if (code === "138") {
    return { ok: true, empty: false, label: "Documentos localizados" };
  }
  if (code === "ERR") {
    return { ok: false, empty: true, label: "Falha de comunicação" };
  }
  const known: Record<string, string> = {
    "215": "Falha no schema XML",
    "243": "XML mal formado",
    "656": "Consumo indevido — aguarde antes de consultar de novo",
    "999": "Resposta inválida da SEFAZ",
  };
  return {
    ok: false,
    empty: true,
    label: known[code] ?? `Rejeição SEFAZ ${code}`,
  };
}

export function formatCaptureSummary(summaries: Array<{
  kind: string;
  cStat: string;
  xMotivo: string;
  docsSaved?: number;
}>): string {
  return summaries
    .map((s) => {
      const c = classifySefazStat(s.cStat);
      const motivo = s.xMotivo?.trim() && !c.ok ? ` — ${s.xMotivo.trim()}` : "";
      return `${s.kind}: ${c.label}${motivo}`;
    })
    .join(" · ");
}
