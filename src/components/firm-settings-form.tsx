"use client";

import { useState } from "react";

export function FirmSettingsForm({
  inicial,
}: {
  inicial: { name: string; brandName: string; brandTagline: string };
}) {
  const [form, setForm] = useState(inicial);
  const [msg, setMsg] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  async function salvar() {
    setMsg(null);
    setErro(null);
    setSalvando(true);
    try {
      const res = await fetch("/api/firm", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const json = (await res.json().catch(() => ({}))) as {
        aviso?: string;
        error?: string;
      };
      if (!res.ok) setErro(json.error ?? "Não foi possível salvar.");
      else setMsg(json.aviso ?? "Salvo.");
    } catch {
      setErro("Falha de conexão.");
    }
    setSalvando(false);
  }

  const campo = "w-full rounded-md border border-border bg-bg-soft px-3 py-2 text-sm";

  return (
    <section className="rounded-lg border border-border bg-bg-elevated p-5 space-y-4">
      <label className="block space-y-1">
        <span className="text-xs text-text-muted">Nome do escritório</span>
        <input
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          className={campo}
        />
      </label>

      <label className="block space-y-1">
        <span className="text-xs text-text-muted">
          Marca exibida ao cliente (portal e comunicação)
        </span>
        <input
          value={form.brandName}
          onChange={(e) => setForm({ ...form, brandName: e.target.value })}
          className={campo}
        />
      </label>

      <label className="block space-y-1">
        <span className="text-xs text-text-muted">Frase da marca (opcional)</span>
        <input
          value={form.brandTagline}
          onChange={(e) => setForm({ ...form, brandTagline: e.target.value })}
          className={campo}
        />
      </label>

      <button
        type="button"
        onClick={salvar}
        disabled={salvando}
        className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-bg disabled:opacity-60"
      >
        {salvando ? "Salvando…" : "Salvar"}
      </button>

      {msg && <p className="text-xs text-text-muted">{msg}</p>}
      {erro && <p className="text-xs text-red-400">{erro}</p>}
    </section>
  );
}
