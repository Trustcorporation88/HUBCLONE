import { redirect } from "next/navigation";
import { requireClientSession } from "@/lib/auth";
import { getAdvisorySummary } from "@/lib/fiscal-health";
import { formatBrl } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function PortalAdvisoryPage() {
  let session;
  try {
    session = await requireClientSession();
  } catch {
    redirect("/portal/login");
  }

  const summary = await getAdvisorySummary({
    firmId: session.firmId,
    clientId: session.clientId!,
    months: 6,
  });

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-xl font-semibold">Advisory</h1>
        <p className="text-sm text-text-muted mt-1">
          Faturamento (XML saída) e impostos — últimos {summary.months} meses
        </p>
      </header>

      <div className="grid grid-cols-2 gap-3">
        <Stat label="Faturamento (XML OUT)" value={formatBrl(summary.revenueCents)} />
        <Stat label="Impostos (guias)" value={formatBrl(summary.taxCents)} />
        <Stat label="Já pagos" value={formatBrl(summary.paidCents)} />
        <Stat label="Em aberto" value={formatBrl(summary.openCents)} />
      </div>

      <p className="text-xs text-text-muted">
        {summary.xmlCount} notas de saída · {summary.obligationCount} obrigações
        no período
      </p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-bg-elevated p-4">
      <div className="text-xs text-text-muted">{label}</div>
      <div className="text-lg font-semibold mt-1">{value}</div>
    </div>
  );
}
