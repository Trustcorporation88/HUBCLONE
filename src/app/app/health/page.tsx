import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { RefreshHealthButton } from "@/components/refresh-health-button";
import { format } from "date-fns";

export const dynamic = "force-dynamic";

export default async function HealthPage() {
  let session;
  try {
    session = await requireSession();
  } catch {
    redirect("/login");
  }
  if (session.role === "CLIENT") redirect("/portal");

  const alerts = await prisma.fiscalAlert.findMany({
    where: { firmId: session.firmId, resolvedAt: null },
    include: { client: true },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap justify-between gap-4 items-start">
        <div>
          <h1 className="text-2xl font-semibold">Saúde fiscal</h1>
          <p className="text-sm text-text-muted mt-1">
            Alertas de certificado, CND, guias vencidas e XML com erro
          </p>
        </div>
        <RefreshHealthButton />
      </header>

      <ul className="divide-y divide-border border border-border rounded-lg text-sm">
        {alerts.map((a) => (
          <li key={a.id} className="px-4 py-3 flex justify-between gap-4">
            <div>
              <div className="font-medium">
                [{a.severity}] {a.type}
              </div>
              <div className="text-text-muted text-xs mt-0.5">
                {a.client.tradeName ?? a.client.legalName} · {a.message}
              </div>
            </div>
            <span className="text-xs text-text-muted shrink-0">
              {format(a.createdAt, "dd/MM")}
            </span>
          </li>
        ))}
        {alerts.length === 0 && (
          <li className="px-4 py-8 text-center text-text-muted">
            Sem alertas abertos — clique em recalcular
          </li>
        )}
      </ul>
    </div>
  );
}
