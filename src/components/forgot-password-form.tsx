"use client";

import { FormEvent, useState } from "react";

export function ForgotPasswordForm() {
  const [slug, setSlug] = useState("");
  const [email, setEmail] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    setAviso(null);
    setEnviando(true);
    try {
      const res = await fetch("/api/auth/forgot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, email }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErro(json.error ?? "Não foi possível processar o pedido.");
      } else {
        setAviso(json.mensagem ?? "Pedido registrado.");
      }
    } catch {
      setErro("Falha de rede. Tente novamente.");
    }
    setEnviando(false);
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <label className="block text-sm">
        <span className="text-text-muted">Slug do escritório</span>
        <input
          value={slug}
          onChange={(e) => setSlug(e.target.value.toLowerCase())}
          placeholder="ex.: trustcorp"
          required
          className="mt-1 w-full rounded-md border border-border bg-bg px-3 py-2 outline-none focus:border-accent"
        />
      </label>

      <label className="block text-sm">
        <span className="text-text-muted">E-mail</span>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          required
          className="mt-1 w-full rounded-md border border-border bg-bg px-3 py-2 outline-none focus:border-accent"
        />
      </label>

      {erro && <p className="text-sm text-danger">{erro}</p>}
      {aviso && (
        <p className="rounded-md border border-accent/40 bg-accent/10 px-3 py-2 text-sm">
          {aviso}
        </p>
      )}

      <button
        type="submit"
        disabled={enviando}
        className="w-full rounded-md bg-accent text-bg py-2.5 text-sm font-medium disabled:opacity-50"
      >
        {enviando ? "Enviando…" : "Enviar link de redefinição"}
      </button>
    </form>
  );
}
