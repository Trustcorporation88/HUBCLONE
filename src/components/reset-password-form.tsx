"use client";

import { useState } from "react";

export function ResetPasswordForm({ code }: { code: string }) {
  const [senha, setSenha] = useState("");
  const [confirmacao, setConfirmacao] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function onSubmit(e: React.FormEvent) {
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
      <label className="block space-y-1">
        <span className="text-sm">Nova senha</span>
        <input
          type="password"
          value={senha}
          onChange={(e) => setSenha(e.target.value)}
          autoComplete="new-password"
          minLength={10}
          required
          className="w-full rounded border px-3 py-2 text-sm"
        />
        <span className="text-xs text-text-muted">Mínimo 10 caracteres.</span>
      </label>

      <label className="block space-y-1">
        <span className="text-sm">Repita a nova senha</span>
        <input
          type="password"
          value={confirmacao}
          onChange={(e) => setConfirmacao(e.target.value)}
          autoComplete="new-password"
          minLength={10}
          required
          className="w-full rounded border px-3 py-2 text-sm"
        />
      </label>

      {erro ? <p className="text-sm text-red-600">{erro}</p> : null}

      <button
        type="submit"
        disabled={enviando}
        className="w-full rounded bg-black px-4 py-2 text-sm text-white disabled:opacity-50"
      >
        {enviando ? "Salvando..." : "Definir senha e entrar"}
      </button>
    </form>
  );
}
