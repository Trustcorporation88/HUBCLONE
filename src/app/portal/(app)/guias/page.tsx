import { prisma } from "@/lib/db";
import { requireClientSession } from "@/lib/auth";
import { formatBrl } from "@/lib/utils";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { redirect } from "next/navigation";
import { PayGuideButtons } from "@/components/pay-guide-buttons";

export const dynamic = "force-dynamic";

export default async function PortalGuiasPage() {
  let session;
  try {
    session = await requireClientSession();
  } catch {
    redirect("/portal/login");
  }

  const items = await prisma.obligation.findMany({
    where: { firmId: session.firmId, clientId: session.clientId! },
    include: {
      payments: { orderBy: { createdAt: "desc" }, take: 5 },
    },
    orderBy: { dueAt: "asc" },
  });

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Minhas guias</h1>
        <p className="text-sm text-text-muted mt-1">
          Pague com código oficial da guia (PIX/boleto) e anexe o comprovante.
          Sem código cadastrado pelo escritório, o pagamento fica bloqueado.
        </p>
      </header>

      <div className="space-y-3">
        {items.map((o) => (
          <article
            key={o.id}
            className="rounded-lg border border-border bg-bg-elevated p-4 flex flex-wrap items-start justify-between gap-4"
          >
            <div>
              <div className="font-medium">
                {o.type} · {o.competence}
              </div>
              <p className="text-sm text-text-muted mt-1">
                {formatBrl(o.amountCents)}
                {o.dueAt
                  ? ` · vence ${format(o.dueAt, "dd/MM/yyyy", { locale: ptBR })}`
                  : null}
              </p>
              <p className="text-xs mt-1 text-warning">{o.status}</p>
            </div>
            <PayGuideButtons
              obligationId={o.id}
              disabled={["CANCELLED", "DRAFT"].includes(o.status)}
              payments={o.payments}
              canPayPix={Boolean(o.pixPayload)}
              canPayBoleto={Boolean(o.barcode)}
            />
          </article>
        ))}
        {items.length === 0 && (
          <p className="text-sm text-text-muted">Nenhuma guia por enquanto.</p>
        )}
      </div>
    </div>
  );
}
