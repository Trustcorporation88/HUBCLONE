"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";

export default function SetupPage() {
  const router = useRouter();
  const [blocked, setBlocked] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [firmName, setFirmName] = useState("");
  const [firmSlug, setFirmSlug] = useState("");
  const [brandName, setBrandName] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [password, setPassword] = useState("");

  useEffect(() => {
    fetch("/api/auth/bootstrap")
      .then((r) => r.json())
      .then((d) => {
        if (!d.needsBootstrap) setBlocked(true);
      })
      .catch(() => setBlocked(true));
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/bootstrap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firmName,
          firmSlug,
          brandName: brandName || undefined,
          ownerName,
          ownerEmail,
          password,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Falha no setup");
      router.replace(data.redirectTo ?? "/app");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro");
    } finally {
      setLoading(false);
    }
  }

  if (blocked) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="w-full max-w-md rounded-lg border border-border bg-bg-elevated p-8 text-center">
          <h1 className="text-xl font-semibold">Setup já concluído</h1>
          <p className="mt-2 text-sm text-text-muted">
            Já existe um escritório. Use o login operacional.
          </p>
          <Link
            href="/login"
            className="mt-6 inline-block rounded-md bg-accent text-bg px-4 py-2 text-sm font-medium"
          >
            Ir para login
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-lg rounded-lg border border-border bg-bg-elevated p-8">
        <div className="flex items-center gap-3">
          <Image
            src="/brand/procontador-os-logo.png"
            alt="ProContador OS"
            width={48}
            height={48}
            className="rounded-sm object-contain"
            priority
          />
          <div className="text-xs uppercase tracking-[0.2em] text-text-muted">
            ProContador OS
          </div>
        </div>
        <h1 className="mt-2 text-2xl font-semibold">Criar escritório</h1>
        <p className="mt-2 text-sm text-text-muted">
          Primeiro cadastro real — sem dados fictícios. Configure SMTP e
          certificados A1 depois no .env e na área XML.
        </p>

        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <label className="block text-sm">
            <span className="text-text-muted">Nome do escritório</span>
            <input
              value={firmName}
              onChange={(e) => {
                setFirmName(e.target.value);
                if (!firmSlug) {
                  setFirmSlug(
                    e.target.value
                      .toLowerCase()
                      .normalize("NFD")
                      .replace(/[\u0300-\u036f]/g, "")
                      .replace(/[^a-z0-9]+/g, "-")
                      .replace(/^-|-$/g, ""),
                  );
                }
              }}
              className="mt-1 w-full rounded-md border border-border bg-bg px-3 py-2 outline-none focus:border-accent"
              required
            />
          </label>
          <label className="block text-sm">
            <span className="text-text-muted">Slug (URL / login)</span>
            <input
              value={firmSlug}
              onChange={(e) => setFirmSlug(e.target.value.toLowerCase())}
              className="mt-1 w-full rounded-md border border-border bg-bg px-3 py-2 outline-none focus:border-accent"
              required
            />
          </label>
          <label className="block text-sm">
            <span className="text-text-muted">Marca (portal cliente)</span>
            <input
              value={brandName}
              onChange={(e) => setBrandName(e.target.value)}
              placeholder="opcional"
              className="mt-1 w-full rounded-md border border-border bg-bg px-3 py-2 outline-none focus:border-accent"
            />
          </label>
          <label className="block text-sm">
            <span className="text-text-muted">Seu nome</span>
            <input
              value={ownerName}
              onChange={(e) => setOwnerName(e.target.value)}
              className="mt-1 w-full rounded-md border border-border bg-bg px-3 py-2 outline-none focus:border-accent"
              required
            />
          </label>
          <label className="block text-sm">
            <span className="text-text-muted">E-mail do owner</span>
            <input
              type="email"
              value={ownerEmail}
              onChange={(e) => setOwnerEmail(e.target.value)}
              className="mt-1 w-full rounded-md border border-border bg-bg px-3 py-2 outline-none focus:border-accent"
              required
            />
          </label>
          <label className="block text-sm">
            <span className="text-text-muted">Senha (mín. 8)</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={8}
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
            {loading ? "Criando…" : "Criar escritório"}
          </button>
        </form>
      </div>
    </div>
  );
}
