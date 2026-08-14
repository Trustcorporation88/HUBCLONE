"use client";

import { useState } from "react";

export function AcceptInviteForm({
  code,
  precisaEscritorio,
  emailTravado,
}: {
  code: string;
  precisaEscritorio: boolean;
  emailTravado: string | null;
}) {
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function enviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErro(null);
    setEnviando(true);
    const form = new FormData(e.currentTarget);
    try {
      const res = await fetch("/api/auth/accept-invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          codigo: code,
          nome: String(form.get("nome") ?? ""),
          email: String(form.get("email") ?? ""),
          senha: String(form.get("senha") ?? ""),
          nomeEscritorio: precisaEscritorio
            ? String(form.get("nomeEscritorio") ?? "")
            : undefined,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        destino?: string;
      };
      if (!res.ok) {
        setErro(json.error ?? "Não foi possível concluir.");
        setEnviando(false);
        return;
      }
      window.location.href = json.destino ?? "/app";
    } catch {
      setErro("Falha de conexão. Tente de novo.");
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={enviar} className="space-y-4">
      {precisaEscritorio && (
        <label className="block space-y-1">
          <span className="text-xs text-text-muted">Nome do escritório</span>
          <input
            name="nomeEscritorio"
            required
            className="w-full rounded-md border border-border bg-bg-soft px-3 py-2 text-sm"
          />
        </label>
      )}

      <label className="block space-y-1">
        <span className="text-xs text-text-muted">Seu nome</span>
        <input
          name="nome"
          required
          className="w-full rounded-md border border-border bg-bg-soft px-3 py-2 text-sm"
        />
      </label>

      <label className="block space-y-1">
        <span className="text-xs text-text-muted">E-mail</span>
        <input
          name="email"
          type="email"
          required
          defaultValue={emailTravado ?? ""}
          readOnly={Boolean(emailTravado)}
          className="w-full rounded-md border border-border bg-bg-soft px-3 py-2 text-sm"
        />
      </label>

      <label className="block space-y-1">
        <span className="text-xs text-text-muted">
          Senha (mínimo 10 caracteres)
        </span>
        <input
          name="senha"
          type="password"
          minLength={10}
          required
          className="w-full rounded-md border border-border bg-bg-soft px-3 py-2 text-sm"
        />
      </label>

      {erro && <p className="text-xs text-red-400">{erro}</p>}

      <button
        type="submit"
        disabled={enviando}
        className="w-full rounded-md bg-accent px-4 py-2 text-sm font-medium text-bg disabled:opacity-60"
      >
        {enviando ? "Criando…" : "Criar acesso"}
      </button>
    </form>
  );
}
