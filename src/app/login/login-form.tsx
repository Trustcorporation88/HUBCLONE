"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AuthLoginForm } from "@/components/auth-login-form";

export default function LoginForm() {
  const [needsBootstrap, setNeedsBootstrap] = useState(false);

  useEffect(() => {
    fetch("/api/auth/bootstrap")
      .then((r) => r.json())
      .then((d) => setNeedsBootstrap(Boolean(d.needsBootstrap)))
      .catch(() => {});
  }, []);

  return (
    <AuthLoginForm
      type="office"
      title="Entrar no escritório"
      subtitle="Acesso do escritório."
      defaultNext="/app"
      buttonLabel="Entrar"
      showLogo
      extraHeader={
        needsBootstrap ? (
          <p className="mt-3 rounded-md border border-accent/40 bg-accent/10 px-3 py-2 text-sm">
            Nenhum escritório cadastrado.{" "}
            <Link href="/setup" className="text-accent underline">
              Criar o primeiro agora
            </Link>
          </p>
        ) : null
      }
      footer={
        <p className="mt-6 text-center text-xs text-text-muted">
          <Link href="/" className="hover:text-text">
            Voltar ao site
          </Link>
        </p>
      }
    />
  );
}
