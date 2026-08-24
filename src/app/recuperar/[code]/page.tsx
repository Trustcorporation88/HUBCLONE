import { carregarReset, minutosDeValidade } from "@/lib/password-reset";
import { ResetPasswordForm } from "@/components/reset-password-form";

export const dynamic = "force-dynamic";

export default async function RecuperarPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const resultado = await carregarReset(code);

  if (!resultado.ok) {
    return (
      <main className="mx-auto max-w-md px-6 py-20 text-center space-y-3">
        <h1 className="text-lg font-medium">Link indisponível</h1>
        <p className="text-sm text-text-muted">{resultado.motivo}</p>
        <p className="text-xs text-text-muted">
          Peça um novo link ao administrador do escritório.
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-md px-6 py-16 space-y-6">
      <header className="space-y-1">
        <h1 className="text-lg font-medium">Definir nova senha</h1>
        <p className="text-sm text-text-muted">
          Este link vale {minutosDeValidade()} minutos e pode ser usado uma única
          vez. Ao confirmar, você entra direto no sistema.
        </p>
      </header>

      <ResetPasswordForm code={code} />
    </main>
  );
}
