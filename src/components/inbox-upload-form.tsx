"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export function InboxUploadForm({
  clients,
  fixedClientId,
}: {
  clients?: Array<{ id: string; label: string }>;
  fixedClientId?: string;
}) {
  const router = useRouter();
  const [clientId, setClientId] = useState(
    fixedClientId ?? clients?.[0]?.id ?? "",
  );
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!file) return;
    setLoading(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      if (!fixedClientId) form.append("clientId", clientId);
      const res = await fetch("/api/inbox", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Falha");
      setFile(null);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      {!fixedClientId && clients && (
        <label className="block text-sm">
          <span className="text-text-muted">Cliente</span>
          <select
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            className="mt-1 w-full rounded-md border border-border bg-bg px-3 py-2"
          >
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
      )}
      <label className="block text-sm">
        <span className="text-text-muted">Foto ou PDF</span>
        <input
          type="file"
          accept="application/pdf,image/*"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="mt-1 w-full text-sm"
          required
        />
      </label>
      <button
        type="submit"
        disabled={loading || !file}
        className="rounded-md bg-accent text-bg px-4 py-2 text-sm font-medium disabled:opacity-50"
      >
        {loading ? "Classificando com OpenAI…" : "Enviar e classificar"}
      </button>
      {error && <p className="text-sm text-danger">{error}</p>}
    </form>
  );
}
