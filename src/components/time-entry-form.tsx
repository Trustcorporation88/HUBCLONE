"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export function TimeEntryForm({
  clients,
}: {
  clients: Array<{ id: string; label: string }>;
}) {
  const router = useRouter();
  const [clientId, setClientId] = useState(clients[0]?.id ?? "");
  const [minutes, setMinutes] = useState(60);
  const [hourlyRateCents, setHourlyRateCents] = useState(15000);
  const [costRateCents, setCostRateCents] = useState(8000);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/time-entries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId,
          minutes,
          hourlyRateCents,
          costRateCents,
          billable: true,
          note: note || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Falha");
      setNote("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="grid md:grid-cols-5 gap-3 items-end">
      <label className="text-sm md:col-span-2">
        <span className="text-text-muted">Cliente</span>
        <select
          value={clientId}
          onChange={(e) => setClientId(e.target.value)}
          className="mt-1 w-full rounded-md border border-border bg-bg px-3 py-2"
          required
        >
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
      </label>
      <label className="text-sm">
        <span className="text-text-muted">Minutos</span>
        <input
          type="number"
          min={1}
          value={minutes}
          onChange={(e) => setMinutes(Number(e.target.value))}
          className="mt-1 w-full rounded-md border border-border bg-bg px-3 py-2"
          required
        />
      </label>
      <label className="text-sm">
        <span className="text-text-muted">R$/h venda (centavos)</span>
        <input
          type="number"
          min={0}
          value={hourlyRateCents}
          onChange={(e) => setHourlyRateCents(Number(e.target.value))}
          className="mt-1 w-full rounded-md border border-border bg-bg px-3 py-2"
        />
      </label>
      <label className="text-sm">
        <span className="text-text-muted">R$/h custo</span>
        <input
          type="number"
          min={0}
          value={costRateCents}
          onChange={(e) => setCostRateCents(Number(e.target.value))}
          className="mt-1 w-full rounded-md border border-border bg-bg px-3 py-2"
        />
      </label>
      <label className="text-sm md:col-span-4">
        <span className="text-text-muted">Nota</span>
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className="mt-1 w-full rounded-md border border-border bg-bg px-3 py-2"
        />
      </label>
      <button
        type="submit"
        disabled={loading || !clientId}
        className="rounded-md bg-accent text-bg px-4 py-2 text-sm font-medium disabled:opacity-50"
      >
        {loading ? "Salvando…" : "Lançar hora"}
      </button>
      {error && <p className="text-sm text-danger md:col-span-5">{error}</p>}
    </form>
  );
}
