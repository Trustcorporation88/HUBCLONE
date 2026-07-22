import { redirect } from "next/navigation";
import { requireClientSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { RefreshHealthButton } from "@/components/refresh-health-button";
import { format } from "date-fns";

export const dynamic = "force-dynamic";

export default async function PortalSaudePage() {
  let session;
  try {
    session = await requireClientSession();
  } catch {
    redirect("/portal/login");
  }

  const alerts = await prisma.fiscalAlert.findMany({
    where: {
      firmId: session.firmId,
      clientId: session.clientId!,
      resolvedAt: null,
    },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap justify-between gap-3 items-start">
        <div>
          <h1 className="text-xl font-semibold">Saúde fiscal</h1>
          <p className="text-sm text-text-muted mt-1">
            CND, certificado A1, guias e XML
          </p>
        </div>
        <RefreshHealthButton clientId={session.clientId!} />
      </header>

      <ul className="space-y-3 text-sm">
        {alerts.map((a) => (
          <li
            key={a.id}
            className="rounded-lg border border-border bg-bg-elevated p-4"
          >
            <div className="font-medium">
              {a.severity} · {a.type}
            </div>
            <p className="text-text-muted mt-1">{a.message}</p>
            <p className="text-xs text-text-muted mt-2">
              {format(a.createdAt, "dd/MM/yyyy")}
            </p>
          </li>
        ))}
        {alerts.length === 0 && (
          <p className="text-text-muted">
            Sem alertas — use recalcular para atualizar
          </p>
        )}
      </ul>
    </div>
  );
}
