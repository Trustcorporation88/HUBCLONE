"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";

export default function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") ?? "/app";

  const [firmSlug, setFirmSlug] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [needsBootstrap, setNeedsBootstrap] = useState(false);

  useEffect(() => {
    fetch("/api/auth/bootstrap")
      .then((r) => r.json())
      .then((d) => setNeedsBootstrap(Boolean(d.needsBootstrap)))
      .catch(() => {});
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, firmSlug }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Falha no login");
      router.replace(data.redirectTo ?? next);
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
        <div className="flex items-center gap-3">
          <Image
            src="/brand/procontador-office-logo.png"
            alt="ProContador Office"
            width={48}
            height={48}
            className="rounded-sm object-contain"
            priority
          />
          <div className="text-xs uppercase tracking-[0.2em] text-text-muted">
            ProContador Office
          </div>
        </div>
        <h1 className="mt-2 text-2xl font-semibold">Entrar no escritório</h1>
        <p className="mt-2 text-sm text-text-muted">
          Acesso do escritório.
        </p>

        {needsBootstrap && (
          <p className="mt-3 rounded-md border border-accent/40 bg-accent/10 px-3 py-2 text-sm">
            Nenhum escritório cadastrado.{" "}
            <Link href="/setup" className="text-accent underline">
              Criar o primeiro agora
            </Link>
          </p>
        )}

        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <label className="block text-sm">
            <span className="text-text-muted">Slug do escritório</span>
            <input
              type="text"
              value={firmSlug}
              onChange={(e) => setFirmSlug(e.target.value.toLowerCase())}
              placeholder="ex.: trust-contabilidade"
              className="mt-1 w-full rounded-md border border-border bg-bg px-3 py-2 outline-none focus:border-accent"
              required
            />
          </label>
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
