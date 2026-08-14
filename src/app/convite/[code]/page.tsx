import { notFound } from "next/navigation";
import { carregarConvite } from "@/lib/invites";
import { AcceptInviteForm } from "@/components/accept-invite-form";

export const dynamic = "force-dynamic";

export default async function ConvitePage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const resultado = await carregarConvite(code);

  if (!resultado.ok) {
    return (
      <main className="mx-auto max-w-md px-6 py-20 text-center space-y-3">
        <h1 className="text-lg font-medium">Convite indisponível</h1>
        <p className="text-sm text-text-muted">{resultado.motivo}</p>
        <p className="text-xs text-text-muted">
          Peça um novo link a quem enviou este.
        </p>
      </main>
    );
  }

  const { convite } = resultado;
  if (convite.kind !== "NEW_FIRM" && convite.kind !== "JOIN_FIRM") notFound();

  return (
    <main className="mx-auto max-w-md px-6 py-16 space-y-6">
      <header className="space-y-1">
        <h1 className="text-lg font-medium">
          {convite.kind === "NEW_FIRM"
            ? "Criar seu escritório"
            : "Entrar no escritório"}
        </h1>
        <p className="text-sm text-text-muted">
          {convite.kind === "NEW_FIRM"
            ? "Seu escritório terá clientes, certificados e integrações próprios, separados dos demais."
            : "Você será adicionado ao escritório que enviou este convite."}
        </p>
      </header>

      <AcceptInviteForm
        code={code}
        precisaEscritorio={convite.kind === "NEW_FIRM"}
        emailTravado={convite.email}
      />
    </main>
  );
}
