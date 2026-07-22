"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export function AuditXmlButton({ clientId }: { clientId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function run() {
    setLoading(true);
    setMsg(null);
    try {
      const res = await fetch("/api/xml/audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Falha");
      setMsg(
        `Auditado: ${data.docs} docs · ${data.blockingCount} bloqueante(s)`,
      );
      router.refresh();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Erro");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={run}
        disabled={loading}
        className="rounded-md border border-border px-3 py-1.5 text-xs hover:bg-bg-soft disabled:opacity-50"
      >
        {loading ? "Auditando…" : "Auditar XML"}
      </button>
      {msg && <span className="text-xs text-text-muted">{msg}</span>}
    </div>
  );
}
