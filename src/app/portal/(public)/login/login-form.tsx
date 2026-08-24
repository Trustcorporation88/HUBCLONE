"use client";

import Link from "next/link";
import { AuthLoginForm } from "@/components/auth-login-form";

export default function PortalLoginForm() {
  return (
    <AuthLoginForm
      type="portal"
      title="Acesso do cliente"
      subtitle="Use o slug do escritório e as credenciais que você recebeu."
      defaultNext="/portal"
      buttonLabel="Entrar no app"
      onSuccess={(data) => {
        if (data.user?.role !== "CLIENT") {
          throw new Error("Esta área é só para clientes. Use o login do escritório.");
        }
      }}
      footer={
        <p className="mt-6 text-center text-xs text-text-muted">
          É do escritório?{" "}
          <Link href="/login" className="text-accent hover:underline">
            Login interno
          </Link>
        </p>
      }
    />
  );
}
