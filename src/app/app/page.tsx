import { requireSession } from "@/lib/auth";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getOfficeDashboard } from "@/lib/dashboard";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  let session;
  try {
    session = await requireSession();
  } catch {
    redirect("/login");
  }

  const d = await getOfficeDashboard(session.firmId);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Geral</h1>
          <p className="text-text-muted mt-1 text-sm">
            Dashboard operacional · {session.firmName}
          </p>
        </div>
        <Legend />
      </header>

      <div className="grid lg:grid-cols-3 gap-4">
        {/* Monitor fiscal — HubStrom MonitorHub level */}
        <section className="lg:col-span-2 rounded-lg border border-border bg-bg-elevated p-5 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="font-medium">Pendências fiscais</h2>
              <p className="text-xs text-text-muted mt-0.5">
                PGDAS, DCTF, FGTS, CND… — em dia / pendência / atenção
              </p>
            </div>
            <Link href="/app/obligations" className="text-xs text-accent">
              Gerenciar guias
            </Link>
          </div>

          <div className="flex flex-wrap gap-3 text-xs">
            <Pill tone="ok" label="Em dia" value={d.obligations.ok} />
            <Pill tone="pending" label="Pendência" value={d.obligations.pending} />
            <Pill
              tone="attention"
              label="Atenção"
              value={d.obligations.attention}
            />
          </div>

          <ul className="space-y-3">
            {d.monitorRows.map((row) => {
              const total = Math.max(1, row.ok + row.pending + row.attention);
              const okPct = (row.ok / total) * 100;
              const pendPct = (row.pending / total) * 100;
              const attPct = (row.attention / total) * 100;
              return (
                <li key={row.type} className="grid grid-cols-[7rem_1fr_3rem] gap-3 items-center text-sm">
                  <span className="text-text-muted text-xs font-medium tracking-wide">
                    {row.type}
                  </span>
                  <div className="h-3 rounded-full bg-bg-soft overflow-hidden flex">
                    <span
                      className="bg-success h-full"
                      style={{ width: `${okPct}%` }}
                      title={`Em dia ${row.ok}`}
                    />
                    <span
                      className="bg-warning h-full"
                      style={{ width: `${pendPct}%` }}
                      title={`Pendência ${row.pending}`}
                    />
                    <span
                      className="bg-danger h-full"
                      style={{ width: `${attPct}%` }}
                      title={`Atenção ${row.attention}`}
                    />
                  </div>
                  <span className="text-xs text-text-muted tabular-nums text-right">
                    {row.total}
                  </span>
                </li>
              );
            })}
          </ul>

          {d.obligations.total === 0 && (
            <p className="text-xs text-text-muted">
              Sem guias ainda. Importe clientes e cadastre obrigações — as barras
              passam a refletir o escritório em tempo real.
            </p>
          )}
        </section>

        {/* Right column cards */}
        <div className="space-y-4">
          <Card
            title="Clientes cadastrados"
            value={String(d.clients)}
            hint={`${d.clientsActive} ativos`}
            href="/app/integrations"
            cta="Importar / gerenciar"
          />

          <section className="rounded-lg border border-border bg-bg-elevated p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium">Certificados digitais</h3>
              <Link href="/app/xml" className="text-xs text-accent">
                Gerenciar
              </Link>
            </div>
            <div className="text-3xl font-semibold tabular-nums">
              {d.certs.total}
            </div>
            <ul className="space-y-1.5 text-xs">
              <StatusRow tone="ok" label="Integrados / válidos" value={d.certs.ok} />
              <StatusRow
                tone="pending"
                label="A vencer (30 dias)"
                value={d.certs.expiring}
              />
              <StatusRow
                tone="attention"
                label="Atenção / expirados"
                value={d.certs.attention}
              />
            </ul>
          </section>

          <section className="rounded-lg border border-border bg-bg-elevated p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium">XML</h3>
              <Link href="/app/xml" className="text-xs text-accent">
                Abrir XML
              </Link>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <MiniStat label="Na base" value={d.xml.total} />
              <MiniStat label="Na fila" value={d.xml.queue} />
              <MiniStat label="Alertas" value={d.xml.alerts} danger={d.xml.alerts > 0} />
              <MiniStat label="Erros" value={d.xml.error} danger={d.xml.error > 0} />
            </div>
          </section>
        </div>
      </div>

      {/* Task + Autopilot row */}
      <div className="grid md:grid-cols-2 gap-4">
        <section className="rounded-lg border border-border bg-bg-elevated p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-medium">Processos</h2>
            <Link href="/app/tasks" className="text-xs text-accent">
              Ver tarefas
            </Link>
          </div>
          <div className="flex items-center gap-6">
            <div className="relative size-28 shrink-0">
              <Donut
                done={d.tasks.done}
                progress={d.tasks.progress}
                todo={d.tasks.todo}
              />
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-xl font-semibold tabular-nums">
                  {d.tasks.total}
                </span>
                <span className="text-[10px] text-text-muted">total</span>
              </div>
            </div>
            <ul className="space-y-2 text-sm flex-1">
              <StatusRow tone="ok" label="Concluídos" value={d.tasks.done} />
              <StatusRow
                tone="pending"
                label="Em progresso"
                value={d.tasks.progress}
              />
              <StatusRow tone="muted" label="A fazer" value={d.tasks.todo} />
              <StatusRow
                tone="attention"
                label="Abertas (todas)"
                value={d.tasks.open}
              />
            </ul>
          </div>
        </section>

        <section className="rounded-lg border border-border bg-bg-elevated p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-medium">Fiscal Autopilot</h2>
              <p className="text-xs text-text-muted">
                {d.pipelinesLive} pipelines vivos — moat vs HubStrom
              </p>
            </div>
            <Link href="/app/pipeline" className="text-xs text-accent">
              Ver todos
            </Link>
          </div>
          <ul className="divide-y divide-border text-sm">
            {d.recentPipelines.map((p) => (
              <li
                key={p.id}
                className="py-2.5 flex justify-between gap-3 items-center"
              >
                <div className="min-w-0">
                  <div className="truncate font-medium">
                    {p.client.tradeName ?? p.client.legalName}
                  </div>
                  <div className="text-xs text-text-muted">
                    {p.obligationType} · {p.competence} · {p.stage}
                  </div>
                </div>
                <Badge status={p.stageStatus} />
              </li>
            ))}
            {d.recentPipelines.length === 0 && (
              <li className="py-6 text-center text-text-muted text-xs">
                Sem pipelines. Cadastre cliente + obrigação para iniciar o
                fechamento ponta a ponta.
              </li>
            )}
          </ul>
        </section>
      </div>

      <section className="grid sm:grid-cols-3 gap-3">
        <QuickLink
          href="/app/health"
          title="Saúde fiscal"
          desc="CND, certificados e atrasos"
        />
        <QuickLink
          href="/app/sla"
          title="SLA envios"
          desc={
            d.deliveriesFailed > 0
              ? `${d.deliveriesFailed} falha(s) de envio`
              : "WhatsApp / e-mail no prazo"
          }
        />
        <QuickLink
          href="/app/capacity"
          title="Fila por setor"
          desc={`${d.tasks.open} tarefas abertas`}
        />
      </section>
    </div>
  );
}

function Legend() {
  return (
    <div className="flex gap-3 text-xs text-text-muted">
      <span className="flex items-center gap-1.5">
        <i className="size-2 rounded-full bg-success inline-block" /> Em dia
      </span>
      <span className="flex items-center gap-1.5">
        <i className="size-2 rounded-full bg-warning inline-block" /> Pendência
      </span>
      <span className="flex items-center gap-1.5">
        <i className="size-2 rounded-full bg-danger inline-block" /> Atenção
      </span>
    </div>
  );
}

function Pill({
  tone,
  label,
  value,
}: {
  tone: "ok" | "pending" | "attention";
  label: string;
  value: number;
}) {
  const color =
    tone === "ok"
      ? "text-success"
      : tone === "pending"
        ? "text-warning"
        : "text-danger";
  return (
    <span className={`rounded-md border border-border px-2.5 py-1 ${color}`}>
      {label} <strong className="tabular-nums">{value}</strong>
    </span>
  );
}

function StatusRow({
  tone,
  label,
  value,
}: {
  tone: "ok" | "pending" | "attention" | "muted";
  label: string;
  value: number;
}) {
  const dot =
    tone === "ok"
      ? "bg-success"
      : tone === "pending"
        ? "bg-warning"
        : tone === "attention"
          ? "bg-danger"
          : "bg-text-muted";
  return (
    <li className="flex justify-between gap-3">
      <span className="flex items-center gap-2 text-text-muted">
        <i className={`size-1.5 rounded-full ${dot} inline-block`} />
        {label}
      </span>
      <span className="tabular-nums font-medium">{value}</span>
    </li>
  );
}

function MiniStat({
  label,
  value,
  danger,
}: {
  label: string;
  value: number;
  danger?: boolean;
}) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-text-muted">
        {label}
      </div>
      <div
        className={`text-xl font-semibold tabular-nums ${danger ? "text-danger" : ""}`}
      >
        {value}
      </div>
    </div>
  );
}

function Card({
  title,
  value,
  hint,
  href,
  cta,
}: {
  title: string;
  value: string;
  hint: string;
  href: string;
  cta: string;
}) {
  return (
    <section className="rounded-lg border border-border bg-bg-elevated p-4 space-y-2">
      <h3 className="text-sm font-medium">{title}</h3>
      <div className="text-3xl font-semibold tabular-nums">{value}</div>
      <p className="text-xs text-text-muted">{hint}</p>
      <Link href={href} className="text-xs text-accent inline-block">
        {cta}
      </Link>
    </section>
  );
}

function Donut({
  done,
  progress,
  todo,
}: {
  done: number;
  progress: number;
  todo: number;
}) {
  const total = Math.max(1, done + progress + todo);
  const c = 2 * Math.PI * 40;
  const d1 = (done / total) * c;
  const d2 = (progress / total) * c;
  const d3 = (todo / total) * c;
  return (
    <svg viewBox="0 0 100 100" className="size-full -rotate-90">
      <circle
        cx="50"
        cy="50"
        r="40"
        fill="none"
        stroke="var(--bg-soft)"
        strokeWidth="12"
      />
      <circle
        cx="50"
        cy="50"
        r="40"
        fill="none"
        stroke="var(--success)"
        strokeWidth="12"
        strokeDasharray={`${d1} ${c - d1}`}
        strokeDashoffset={0}
      />
      <circle
        cx="50"
        cy="50"
        r="40"
        fill="none"
        stroke="var(--accent)"
        strokeWidth="12"
        strokeDasharray={`${d2} ${c - d2}`}
        strokeDashoffset={-d1}
      />
      <circle
        cx="50"
        cy="50"
        r="40"
        fill="none"
        stroke="var(--text-muted)"
        strokeWidth="12"
        strokeDasharray={`${d3} ${c - d3}`}
        strokeDashoffset={-(d1 + d2)}
        opacity={0.5}
      />
    </svg>
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
  return <span className={`text-xs font-medium shrink-0 ${tone}`}>{status}</span>;
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
      <div className="font-medium text-sm">{title}</div>
      <p className="mt-1 text-xs text-text-muted">{desc}</p>
    </Link>
  );
}
