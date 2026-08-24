"use client";

import { FormEvent, useState } from "react";

export function ResetPasswordForm({ code }: { code: string }) {
  const [senha, setSenha] = useState("");
  const [confirmacao, setConfirmacao] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setErro(null);

    if (senha !== confirmacao) {
      setErro("As duas senhas não são iguais.");
      return;
    }
    if (senha.length < 10) {
      setErro("A senha precisa de pelo menos 10 caracteres.");
      return;
    }

    setEnviando(true);
    try {
      const res = await fetch("/api/auth/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ codigo: code, senha }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErro(json.error ?? "Não foi possível redefinir a senha.");
        setEnviando(false);
        return;
      }
      // A resposta já trouxe o cookie de sessão: o reset entra logado.
      window.location.href = json.destino ?? "/app";
    } catch {
      setErro("Falha de rede. Tente novamente.");
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <label className="block text-sm">
        <span className="text-text-muted">Nova senha</span>
        <input
          type="password"
          value={senha}
          onChange={(e) => setSenha(e.target.value)}
          autoComplete="new-password"
          minLength={10}
          required
          className="mt-1 w-full rounded-md border border-border bg-bg px-3 py-2 outline-none focus:border-accent"
        />
        <span className="mt-1 block text-xs text-text-muted">
          Mínimo 10 caracteres.
        </span>
      </label>

      <label className="block text-sm">
        <span className="text-text-muted">Repita a nova senha</span>
        <input
          type="password"
          value={confirmacao}
          onChange={(e) => setConfirmacao(e.target.value)}
          autoComplete="new-password"
          minLength={10}
          required
          className="mt-1 w-full rounded-md border border-border bg-bg px-3 py-2 outline-none focus:border-accent"
        />
      </label>

      {erro && <p className="text-sm text-danger">{erro}</p>}

      <button
        type="submit"
        disabled={enviando}
        className="w-full rounded-md bg-accent text-bg py-2.5 text-sm font-medium disabled:opacity-50"
      >
        {enviando ? "Salvando…" : "Definir senha e entrar"}
      </button>
    </form>
  );
}
