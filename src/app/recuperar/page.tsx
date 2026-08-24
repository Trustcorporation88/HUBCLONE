import { ForgotPasswordForm } from "@/components/forgot-password-form";

export const dynamic = "force-dynamic";

export default function EsqueciSenhaPage() {
  return (
    <main className="mx-auto max-w-md px-6 py-16 space-y-6">
      <header className="space-y-1">
        <h1 className="text-lg font-medium">Esqueci minha senha</h1>
        <p className="text-sm text-text-muted">
          Informe o slug do escritório e seu e-mail. Se houver conta, enviamos um
          link de redefinição.
        </p>
      </header>

      <ForgotPasswordForm />

      <p className="text-xs text-text-muted">
        Se este servidor não tiver e-mail configurado, peça o link diretamente ao
        OWNER ou MANAGER do seu escritório — ele consegue emitir sem depender de
        SMTP.
      </p>
    </main>
  );
}
