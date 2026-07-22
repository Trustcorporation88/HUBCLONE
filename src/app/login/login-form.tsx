"use client";

import { FormEvent, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

export default function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") ?? "/app";

  const [email, setEmail] = useState("owner@trust.demo");
  const [password, setPassword] = useState("hub123");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          password,
          firmSlug: "trust-demo",
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Falha no login");
      router.replace(next);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-md rounded-lg border border-border bg-bg-elevated p-8">
        <div className="text-xs uppercase tracking-[0.2em] text-text-muted">
          HUB Contábil OS
        </div>
        <h1 className="mt-2 text-2xl font-semibold">Entrar no escritório</h1>
        <p className="mt-2 text-sm text-text-muted">
          Multi-tenant por escritório. Demo:{" "}
          <code className="text-accent">owner@trust.demo</code> /{" "}
          <code className="text-accent">hub123</code>
        </p>

        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <label className="block text-sm">
            <span className="text-text-muted">E-mail</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full rounded-md border border-border bg-bg px-3 py-2 outline-none focus:border-accent"
              required
            />
          </label>
          <label className="block text-sm">
            <span className="text-text-muted">Senha</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full rounded-md border border-border bg-bg px-3 py-2 outline-none focus:border-accent"
              required
            />
          </label>
          {error && <p className="text-sm text-danger">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-md bg-accent text-bg py-2.5 text-sm font-medium disabled:opacity-50"
          >
            {loading ? "Entrando…" : "Entrar"}
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-text-muted">
          <Link href="/" className="hover:text-text">
            Voltar ao site
          </Link>
        </p>
      </div>
    </div>
  );
}
