"use client";

import { FormEvent, ReactNode, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";

interface AuthLoginFormProps {
  type: "office" | "portal";
  title: string;
  subtitle: string;
  defaultNext: string;
  buttonLabel: string;
  showLogo?: boolean;
  onSuccess?: (data: any) => void;
  extraHeader?: ReactNode;
  footer?: ReactNode;
}

export function AuthLoginForm({
  type,
  title,
  subtitle,
  defaultNext,
  buttonLabel,
  showLogo,
  onSuccess,
  extraHeader,
  footer,
}: AuthLoginFormProps) {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") ?? defaultNext;

  const [firmSlug, setFirmSlug] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
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
        body: JSON.stringify({ email, password, firmSlug }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Falha no login");
      
      if (onSuccess) {
        onSuccess(data);
      }

      router.replace(data.redirectTo ?? next);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro");
    } finally {
      setLoading(false);
    }
  }

  const slugId = `slug-${type}`;
  const emailId = `email-${type}`;
  const passwordId = `password-${type}`;

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-md rounded-lg border border-border bg-bg-elevated p-8">
        <div className="flex flex-col gap-2">
          {showLogo && (
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
          )}
          {!showLogo && (
             <div className="text-xs uppercase tracking-[0.2em] text-text-muted">
              {type === "portal" ? "Portal do cliente" : "ProContador Office"}
            </div>
          )}
          <h1 className="text-2xl font-semibold">{title}</h1>
          <p className="text-sm text-text-muted">{subtitle}</p>
        </div>

        {extraHeader}

        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <div className="space-y-1">
            <label htmlFor={slugId} className="block text-sm text-text-muted">
              Slug do escritório
            </label>
            <input
              id={slugId}
              type="text"
              value={firmSlug}
              onChange={(e) => setFirmSlug(e.target.value.toLowerCase())}
              placeholder="ex.: trust-contabilidade"
              className="w-full rounded-md border border-border bg-bg px-3 py-2 outline-none focus:border-accent"
              required
            />
          </div>
          <div className="space-y-1">
            <label htmlFor={emailId} className="block text-sm text-text-muted">
              E-mail
            </label>
            <input
              id={emailId}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-md border border-border bg-bg px-3 py-2 outline-none focus:border-accent"
              required
            />
          </div>
          <div className="space-y-1">
            <label htmlFor={passwordId} className="block text-sm text-text-muted">
              Senha
            </label>
            <input
              id={passwordId}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-md border border-border bg-bg px-3 py-2 outline-none focus:border-accent"
              required
            />
          </div>
          {error && (
            <p className="text-sm text-danger" role="alert">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-md bg-accent text-bg py-2.5 text-sm font-medium disabled:opacity-50"
          >
            {loading ? "Entrando…" : buttonLabel}
          </button>
        </form>

        {footer}
      </div>
    </div>
  );
}
