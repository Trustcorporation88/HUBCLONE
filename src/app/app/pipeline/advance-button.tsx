"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function AdvancePipelineButton({
  pipelineId,
  stage,
  stageStatus,
}: {
  pipelineId: string;
  stage: string;
  stageStatus: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function advance() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/pipeline/${pipelineId}/advance`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Falha ao avançar");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro");
    } finally {
      setLoading(false);
    }
  }

  if (stage === "CLOSE" && stageStatus === "DONE") {
    return (
      <span className="text-xs text-success font-medium">Pipeline fechado</span>
    );
  }

  return (
    <div className="text-right">
      <button
        type="button"
        onClick={advance}
        disabled={loading}
        className="rounded-md bg-accent text-bg px-3 py-1.5 text-sm font-medium disabled:opacity-50"
      >
        {loading ? "Avançando…" : `Aprovar ${stage} →`}
      </button>
      {error && <p className="text-xs text-danger mt-1">{error}</p>}
    </div>
  );
}
