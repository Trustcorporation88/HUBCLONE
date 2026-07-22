import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getClientPnl, entryRevenueCents, entryCostCents } from "@/lib/pnl";
import { formatBrl } from "@/lib/utils";
import { TimeEntryForm } from "@/components/time-entry-form";
import { format } from "date-fns";

export const dynamic = "force-dynamic";

export default async function PnlPage() {
  let session;
  try {
    session = await requireSession();
  } catch {
    redirect("/login");
  }
  if (session.role === "CLIENT") redirect("/portal");

  const [clients, pnl] = await Promise.all([
    prisma.client.findMany({
      where: { firmId: session.firmId, active: true },
      orderBy: { legalName: "asc" },
    }),
    getClientPnl(session.firmId),
  ]);

  const clientOpts = clients.map((c) => ({
    id: c.id,
    label: c.tradeName ?? c.legalName,
  }));

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold">P&L interno</h1>
        <p className="text-sm text-text-muted mt-1">
          Margem e horas por cliente (receita billable − custo interno)
        </p>
      </header>

      <section className="rounded-lg border border-border bg-bg-elevated p-5">
        <h2 className="font-medium mb-4">Lançar hora</h2>
        <TimeEntryForm clients={clientOpts} />
      </section>

      <section className="rounded-lg border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-bg-elevated text-text-muted text-left">
            <tr>
              <th className="px-4 py-3">Cliente</th>
              <th className="px-4 py-3">Horas</th>
              <th className="px-4 py-3">Receita</th>
              <th className="px-4 py-3">Custo</th>
              <th className="px-4 py-3">Margem</th>
            </tr>
          </thead>
          <tbody>
            {pnl.byClient.map((r) => (
              <tr key={r.clientId} className="border-t border-border">
                <td className="px-4 py-3">{r.clientName}</td>
                <td className="px-4 py-3">
                  {(r.minutes / 60).toFixed(1)}h
                </td>
                <td className="px-4 py-3">{formatBrl(r.revenueCents)}</td>
                <td className="px-4 py-3">{formatBrl(r.costCents)}</td>
                <td className="px-4 py-3 font-medium">
                  {formatBrl(r.marginCents)}
                </td>
              </tr>
            ))}
            {pnl.byClient.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-text-muted">
                  Sem lançamentos ainda
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <section className="space-y-2">
        <h2 className="font-medium">Últimos lançamentos</h2>
        <ul className="text-sm divide-y divide-border border border-border rounded-lg">
          {pnl.entries.slice(0, 30).map((e) => (
            <li key={e.id} className="px-4 py-2 flex justify-between gap-4">
              <span>
                {e.client.tradeName ?? e.client.legalName} · {e.user.name} ·{" "}
                {e.minutes} min
                {e.note ? ` — ${e.note}` : ""}
              </span>
              <span className="text-text-muted text-xs shrink-0">
                {format(e.workedAt, "dd/MM")} ·{" "}
                {formatBrl(entryRevenueCents(e) - entryCostCents(e))}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
