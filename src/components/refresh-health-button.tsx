"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function RefreshHealthButton({ clientId }: { clientId?: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function run() {
    setLoading(true);
    setMsg(null);
    try {
      const res = await fetch("/api/health/fiscal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(clientId ? { clientId } : {}),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Falha");
      setMsg(`${data.alertsCreated} alerta(s) gerados`);
      router.refresh();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Erro");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={run}
        disabled={loading}
        className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-bg-soft disabled:opacity-50"
      >
        {loading ? "Atualizando…" : "Recalcular saúde"}
      </button>
      {msg && <span className="text-xs text-text-muted">{msg}</span>}
    </div>
  );
}
