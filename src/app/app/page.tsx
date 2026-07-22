import { prisma } from "@/lib/db";
import { formatBrl } from "@/lib/utils";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const [tasks, obligations, xmls, pipelines, clients] = await Promise.all([
    prisma.task.count(),
    prisma.obligation.count(),
    prisma.xmlDocument.count(),
    prisma.fiscalPipeline.findMany({
      include: { client: true },
      orderBy: { updatedAt: "desc" },
      take: 5,
    }),
    prisma.client.count(),
  ]);

  const openTasks = await prisma.task.count({
    where: { status: { in: ["PENDING", "IN_PROGRESS", "BLOCKED"] } },
  });
  const overdueGuides = await prisma.obligation.count({
    where: { status: { in: ["READY", "SENT", "OVERDUE"] } },
  });
  const xmlWarnings = await prisma.xmlDocument.count({
    where: { status: { in: ["WARNING", "ERROR"] } },
  });

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Painel do escritório</h1>
        <p className="text-text-muted mt-1 text-sm">
          Visão operacional · {clients} clientes · demo Trust Contabilidade
        </p>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Stat label="Tarefas abertas" value={String(openTasks)} hint={`${tasks} total`} />
        <Stat label="Guias ativas" value={String(overdueGuides)} hint={`${obligations} total`} />
        <Stat label="XMLs na base" value={String(xmls)} hint={`${xmlWarnings} com alerta`} />
        <Stat label="Pipelines vivos" value={String(pipelines.length)} hint="piloto DAS" />
      </div>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium">Fiscal Autopilot — em andamento</h2>
          <Link href="/app/pipeline" className="text-sm text-accent">
            Ver todos
          </Link>
        </div>
        <div className="rounded-lg border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-bg-soft text-text-muted text-left">
              <tr>
                <th className="px-4 py-3 font-medium">Cliente</th>
                <th className="px-4 py-3 font-medium">Obrigação</th>
                <th className="px-4 py-3 font-medium">Estágio</th>
                <th className="px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {pipelines.map((p) => (
                <tr key={p.id} className="border-t border-border">
                  <td className="px-4 py-3">{p.client.tradeName ?? p.client.legalName}</td>
                  <td className="px-4 py-3">
                    {p.obligationType} · {p.competence}
                  </td>
                  <td className="px-4 py-3">{p.stage}</td>
                  <td className="px-4 py-3">
                    <Badge status={p.stageStatus} />
                  </td>
                </tr>
              ))}
              {pipelines.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-text-muted">
                    Rode <code className="text-accent">npm run db:setup</code> para popular o demo.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid md:grid-cols-3 gap-4">
        <QuickLink href="/app/tasks" title="Tarefas" desc="Processos, prazos, OS — nível Karbon/TaskHub" />
        <QuickLink href="/app/obligations" title="Guias" desc={`Envio + status · ${formatBrl(184750)} exemplo DAS`} />
        <QuickLink href="/app/xml" title="XML" desc="Compra/venda com auditoria pré-lançamento" />
      </section>
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-bg-elevated p-4">
      <div className="text-xs text-text-muted uppercase tracking-wide">{label}</div>
      <div className="mt-2 text-3xl font-semibold tabular-nums">{value}</div>
      <div className="mt-1 text-xs text-text-muted">{hint}</div>
    </div>
  );
}

function Badge({ status }: { status: string }) {
  const tone =
    status === "DONE"
      ? "text-success"
      : status === "FAILED"
        ? "text-danger"
        : status === "NEEDS_APPROVAL"
          ? "text-warning"
          : "text-accent";
  return <span className={`text-xs font-medium ${tone}`}>{status}</span>;
}

function QuickLink({
  href,
  title,
  desc,
}: {
  href: string;
  title: string;
  desc: string;
}) {
  return (
    <Link
      href={href}
      className="block rounded-lg border border-border bg-bg-elevated p-4 hover:border-accent transition-colors"
    >
      <div className="font-medium">{title}</div>
      <p className="mt-1 text-sm text-text-muted">{desc}</p>
    </Link>
  );
}
