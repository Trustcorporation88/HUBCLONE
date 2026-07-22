"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

const FIELDS: Record<string, Array<{ key: string; label: string }>> = {
  OPENAI: [{ key: "apiKey", label: "API Key" }],
  OMIE: [
    { key: "appKey", label: "App Key" },
    { key: "appSecret", label: "App Secret" },
  ],
  CLICKSIGN: [
    { key: "accessToken", label: "Access Token" },
    { key: "baseUrl", label: "Base URL (opcional)" },
  ],
  DOMINIO: [
    { key: "baseUrl", label: "Base URL API" },
    { key: "apiToken", label: "API Token" },
  ],
};

export function IntegrationConnectForm({ provider }: { provider: string }) {
  const router = useRouter();
  const fields = FIELDS[provider] ?? [];
  const [values, setValues] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setOk(null);
    try {
      const credentials: Record<string, string> = {};
      for (const f of fields) {
        if (values[f.key]?.trim()) credentials[f.key] = values[f.key].trim();
      }
      const res = await fetch("/api/integrations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, credentials, test: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Falha");
      if (data.integration?.status === "ERROR") {
        throw new Error(data.integration.lastError ?? "Teste falhou");
      }
      setOk(data.hint ?? "Conectado");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-2 mt-3">
      {fields.map((f) => (
        <label key={f.key} className="block text-xs">
          <span className="text-text-muted">{f.label}</span>
          <input
            type={f.key.toLowerCase().includes("secret") || f.key.includes("Token") || f.key.includes("Key") ? "password" : "text"}
            value={values[f.key] ?? ""}
            onChange={(e) =>
              setValues((v) => ({ ...v, [f.key]: e.target.value }))
            }
            className="mt-1 w-full rounded-md border border-border bg-bg px-2 py-1.5"
          />
        </label>
      ))}
      <button
        type="submit"
        disabled={loading}
        className="rounded-md bg-accent text-bg px-3 py-1.5 text-xs font-medium disabled:opacity-50"
      >
        {loading ? "Testando…" : "Conectar e testar"}
      </button>
      {error && <p className="text-xs text-danger">{error}</p>}
      {ok && <p className="text-xs text-accent">{ok}</p>}
    </form>
  );
}
