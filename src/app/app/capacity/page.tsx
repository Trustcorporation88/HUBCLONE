import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { getCapacityByDepartment } from "@/lib/capacity";
import { format } from "date-fns";

export const dynamic = "force-dynamic";

export default async function CapacityPage() {
  let session;
  try {
    session = await requireSession();
  } catch {
    redirect("/login");
  }
  if (session.role === "CLIENT") redirect("/portal");

  const rows = await getCapacityByDepartment(session.firmId);

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold">Capacidade e fila</h1>
        <p className="text-sm text-text-muted mt-1">
          Fila inteligente por setor — tarefas abertas, atrasadas e sem responsável
        </p>
      </header>

      {rows.length === 0 && (
        <p className="text-text-muted text-sm">Nenhuma tarefa aberta.</p>
      )}

      {rows.map((row) => (
        <section
          key={row.department}
          className="rounded-lg border border-border bg-bg-elevated p-5 space-y-4"
        >
          <div className="flex flex-wrap gap-4 items-baseline justify-between">
            <h2 className="font-medium text-lg">{row.department}</h2>
            <div className="text-xs text-text-muted flex gap-3">
              <span>{row.open} abertas</span>
              <span className="text-danger">{row.overdue} atrasadas</span>
              <span>{row.unassigned} sem assignee</span>
            </div>
          </div>
          <ul className="divide-y divide-border text-sm">
            {row.tasks.slice(0, 20).map((t) => (
              <li key={t.id} className="py-2 flex justify-between gap-4">
                <div>
                  <div className="font-medium">{t.title}</div>
                  <div className="text-xs text-text-muted">
                    {t.client
                      ? t.client.tradeName ?? t.client.legalName
                      : "—"}{" "}
                    · {t.assignee?.name ?? "sem responsável"} · {t.priority}
                  </div>
                </div>
                <div className="text-xs text-text-muted shrink-0">
                  {t.dueAt ? format(t.dueAt, "dd/MM/yyyy") : "sem prazo"}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
