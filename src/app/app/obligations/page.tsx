import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { formatBrl } from "@/lib/utils";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { redirect } from "next/navigation";
import {
  MarkViewedButton,
  SendGuideButtons,
} from "@/components/send-guide-buttons";
import { PayGuideButtons } from "@/components/pay-guide-buttons";

export const dynamic = "force-dynamic";

export default async function ObligationsPage() {
  let session;
  try {
    session = await requireSession();
  } catch {
    redirect("/login");
  }

  const items = await prisma.obligation.findMany({
    where: { firmId: session.firmId },
    include: {
      client: true,
      deliveries: { orderBy: { createdAt: "desc" }, take: 4 },
      payments: { orderBy: { createdAt: "desc" }, take: 5 },
    },
    orderBy: { dueAt: "asc" },
  });

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Guias & obrigações</h1>
        <p className="text-sm text-text-muted mt-1">
          E-mail automático · WhatsApp manual (baixar arquivo e anexar) · pagamento
          PIX/boleto.
        </p>
      </header>

      <div className="space-y-4">
        {items.map((o) => (
          <article
            key={o.id}
            className="rounded-lg border border-border bg-bg-elevated p-4"
          >
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="font-medium">
                    {o.type} · {o.competence}
                  </h2>
                  <StatusBadge status={o.status} />
                </div>
                <p className="text-sm text-text-muted mt-1">
                  {o.client.tradeName ?? o.client.legalName} ·{" "}
                  {formatBrl(o.amountCents)}
                  {o.dueAt
                    ? ` · vence ${format(o.dueAt, "dd/MM/yyyy", { locale: ptBR })}`
                    : null}
                </p>
                <p className="text-xs text-text-muted mt-1">
                  E-mail: {o.client.email ?? "—"} · WhatsApp:{" "}
                  {o.client.whatsapp ?? "—"}
                </p>
              </div>
              <div className="flex flex-col items-end gap-3">
                <SendGuideButtons
                  obligationId={o.id}
                  hasEmail={Boolean(o.client.email)}
                  hasWhatsapp={Boolean(o.client.whatsapp)}
                  whatsappPhone={o.client.whatsapp}
                  disabled={["PAID", "CANCELLED"].includes(o.status)}
                />
                <PayGuideButtons
                  obligationId={o.id}
                  disabled={["CANCELLED", "DRAFT"].includes(o.status)}
                  payments={o.payments}
                  canPayPix={Boolean(o.pixPayload)}
                  canPayBoleto={Boolean(o.barcode)}
                />
              </div>
            </div>

            {o.deliveries.length > 0 && (
              <div className="mt-4 border-t border-border pt-3">
                <div className="text-xs text-text-muted mb-2">
                  Histórico de envio
                </div>
                <ul className="space-y-1.5">
                  {o.deliveries.map((d) => (
                    <li
                      key={d.id}
                      className="flex flex-wrap items-center justify-between gap-2 text-xs"
                    >
                      <span>
                        <span className="font-medium">{d.channel}</span>
                        {" → "}
                        {d.toAddress || "(sem destino)"}
                        {" · "}
                        <DeliveryStatus status={d.status} />
                        {d.sentAt
                          ? ` · ${format(d.sentAt, "dd/MM HH:mm", { locale: ptBR })}`
                          : null}
                        {d.errorMessage ? (
                          <span className="text-danger"> — {d.errorMessage}</span>
                        ) : null}
                      </span>
                      {d.status === "SENT" || d.status === "DELIVERED" ? (
                        <MarkViewedButton deliveryId={d.id} />
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </article>
        ))}

        {items.length === 0 && (
          <p className="text-sm text-text-muted">Nenhuma guia nesta carteira.</p>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const tone =
    status === "PAID" || status === "VIEWED"
      ? "text-success"
      : status === "SENT"
        ? "text-accent"
        : status === "OVERDUE"
          ? "text-danger"
          : "text-warning";
  return <span className={`text-xs font-medium ${tone}`}>{status}</span>;
}

function DeliveryStatus({ status }: { status: string }) {
  const tone =
    status === "VIEWED" || status === "DELIVERED"
      ? "text-success"
      : status === "FAILED"
        ? "text-danger"
        : status === "SENT"
          ? "text-accent"
          : "text-text-muted";
  return <span className={tone}>{status}</span>;
}
