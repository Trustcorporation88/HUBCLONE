import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { formatBrl } from "@/lib/utils";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { redirect } from "next/navigation";

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
    include: { client: true },
    orderBy: { dueAt: "asc" },
  });

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Guias & obrigações</h1>
        <p className="text-sm text-text-muted mt-1">
          MonitorHub+ : gerar, enviar, rastrear visualização — e depois pagar
          (Dootax-level).
        </p>
      </header>

      <div className="rounded-lg border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-bg-soft text-text-muted text-left">
            <tr>
              <th className="px-4 py-3 font-medium">Tipo</th>
              <th className="px-4 py-3 font-medium">Cliente</th>
              <th className="px-4 py-3 font-medium">Competência</th>
              <th className="px-4 py-3 font-medium">Valor</th>
              <th className="px-4 py-3 font-medium">Vencimento</th>
              <th className="px-4 py-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {items.map((o) => (
              <tr key={o.id} className="border-t border-border">
                <td className="px-4 py-3 font-medium">{o.type}</td>
                <td className="px-4 py-3">
                  {o.client.tradeName ?? o.client.legalName}
                </td>
                <td className="px-4 py-3 tabular-nums">{o.competence}</td>
                <td className="px-4 py-3 tabular-nums">
                  {formatBrl(o.amountCents)}
                </td>
                <td className="px-4 py-3 tabular-nums">
                  {o.dueAt
                    ? format(o.dueAt, "dd/MM/yyyy", { locale: ptBR })
                    : "—"}
                </td>
                <td className="px-4 py-3">
                  <span className="text-xs text-warning">{o.status}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
