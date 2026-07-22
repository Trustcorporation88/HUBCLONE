import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function TasksPage() {
  let session;
  try {
    session = await requireSession();
  } catch {
    redirect("/login");
  }

  const tasks = await prisma.task.findMany({
    where: { firmId: session.firmId },
    include: { client: true, assignee: true },
    orderBy: [{ status: "asc" }, { dueAt: "asc" }],
  });

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Tarefas</h1>
        <p className="text-sm text-text-muted mt-1">
          Inspirado em TaskHub + workflow Karbon — templates, responsáveis, SLA.
        </p>
      </header>

      <div className="rounded-lg border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-bg-soft text-text-muted text-left">
            <tr>
              <th className="px-4 py-3 font-medium">Tarefa</th>
              <th className="px-4 py-3 font-medium">Cliente</th>
              <th className="px-4 py-3 font-medium">Resp.</th>
              <th className="px-4 py-3 font-medium">Prazo</th>
              <th className="px-4 py-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {tasks.map((t) => (
              <tr key={t.id} className="border-t border-border">
                <td className="px-4 py-3">
                  <div className="font-medium">{t.title}</div>
                  <div className="text-xs text-text-muted">{t.department}</div>
                </td>
                <td className="px-4 py-3">
                  {t.client?.tradeName ?? t.client?.legalName ?? "—"}
                </td>
                <td className="px-4 py-3">{t.assignee?.name ?? "—"}</td>
                <td className="px-4 py-3 tabular-nums">
                  {t.dueAt
                    ? format(t.dueAt, "dd MMM", { locale: ptBR })
                    : "—"}
                </td>
                <td className="px-4 py-3">
                  <StatusPill status={t.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    PENDING: "bg-bg-soft text-text-muted",
    IN_PROGRESS: "bg-accent-soft text-accent",
    BLOCKED: "bg-bg-soft text-danger",
    DONE: "bg-bg-soft text-success",
    CANCELLED: "bg-bg-soft text-text-muted",
  };
  return (
    <span className={`text-xs px-2 py-1 rounded ${map[status] ?? map.PENDING}`}>
      {status}
    </span>
  );
}
