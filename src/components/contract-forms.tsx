"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export function ContractCreateForm({
  clients,
}: {
  clients: Array<{ id: string; label: string }>;
}) {
  const router = useRouter();
  const [clientId, setClientId] = useState(clients[0]?.id ?? "");
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<"OS" | "CONTRACT">("OS");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/contracts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, title, kind }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Falha");
      setTitle("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-wrap gap-3 items-end">
      <label className="text-sm">
        <span className="text-text-muted">Cliente</span>
        <select
          value={clientId}
          onChange={(e) => setClientId(e.target.value)}
          className="mt-1 block rounded-md border border-border bg-bg px-3 py-2"
        >
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
      </label>
      <label className="text-sm">
        <span className="text-text-muted">Tipo</span>
        <select
          value={kind}
          onChange={(e) => setKind(e.target.value as "OS" | "CONTRACT")}
          className="mt-1 block rounded-md border border-border bg-bg px-3 py-2"
        >
          <option value="OS">OS</option>
          <option value="CONTRACT">Contrato</option>
        </select>
      </label>
      <label className="text-sm grow">
        <span className="text-text-muted">Título</span>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="mt-1 w-full rounded-md border border-border bg-bg px-3 py-2"
          required
        />
      </label>
      <button
        type="submit"
        disabled={loading}
        className="rounded-md bg-accent text-bg px-4 py-2 text-sm font-medium disabled:opacity-50"
      >
        Criar
      </button>
      {error && <p className="w-full text-sm text-danger">{error}</p>}
    </form>
  );
}

export function ContractSendButton({ id }: { id: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function send() {
    setLoading(true);
    await fetch(`/api/contracts/${id}/send`, { method: "POST" });
    router.refresh();
    setLoading(false);
  }

  return (
    <button
      type="button"
      onClick={send}
      disabled={loading}
      className="text-xs text-accent hover:underline disabled:opacity-50"
    >
      Enviar ao cliente
    </button>
  );
}
