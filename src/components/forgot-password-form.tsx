"use client";

import { useState } from "react";

export function ForgotPasswordForm() {
  const [slug, setSlug] = useState("");
  const [email, setEmail] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function onSubmit(e: React.FormEvent) {
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
      <label className="block space-y-1">
        <span className="text-sm">Slug do escritório</span>
        <input
          value={slug}
          onChange={(e) => setSlug(e.target.value)}
          placeholder="ex.: trustcorp"
          required
          className="w-full rounded border px-3 py-2 text-sm"
        />
      </label>

      <label className="block space-y-1">
        <span className="text-sm">E-mail</span>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          required
          className="w-full rounded border px-3 py-2 text-sm"
        />
      </label>

      {erro ? <p className="text-sm text-red-600">{erro}</p> : null}
      {aviso ? <p className="text-sm text-text-muted">{aviso}</p> : null}

      <button
        type="submit"
        disabled={enviando}
        className="w-full rounded bg-black px-4 py-2 text-sm text-white disabled:opacity-50"
      >
        {enviando ? "Enviando..." : "Enviar link de redefinição"}
      </button>
    </form>
  );
}
