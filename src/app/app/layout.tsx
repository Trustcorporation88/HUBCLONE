import Link from "next/link";
import {
  LayoutDashboard,
  ListTodo,
  Receipt,
  FileCode2,
  Workflow,
  BookOpen,
  Gauge,
  LineChart,
  Timer,
  Puzzle,
  FileSignature,
  Inbox,
  ShieldAlert,
} from "lucide-react";
import { readSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { LogoutButton } from "@/components/logout-button";

const NAV = [
  { href: "/app", label: "Painel", icon: LayoutDashboard },
  { href: "/app/tasks", label: "Tarefas", icon: ListTodo },
  { href: "/app/capacity", label: "Fila", icon: Gauge },
  { href: "/app/pnl", label: "P&L", icon: LineChart },
  { href: "/app/sla", label: "SLA", icon: Timer },
  { href: "/app/obligations", label: "Guias", icon: Receipt },
  { href: "/app/xml", label: "XML", icon: FileCode2 },
  { href: "/app/pipeline", label: "Autopilot", icon: Workflow },
  { href: "/app/contracts", label: "Contratos", icon: FileSignature },
  { href: "/app/inbox", label: "Inbox", icon: Inbox },
  { href: "/app/health", label: "Saúde", icon: ShieldAlert },
  { href: "/app/integrations", label: "Integrações", icon: Puzzle },
  { href: "/app/knowledge", label: "Benchmark", icon: BookOpen },
];

export default async function AppShellLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await readSession();
  if (!session) redirect("/login");

  return (
    <div className="min-h-screen flex bg-bg text-text">
      <aside className="w-60 shrink-0 border-r border-border bg-bg-elevated flex flex-col">
        <div className="px-5 py-6 border-b border-border">
          <div className="text-xs uppercase tracking-[0.2em] text-text-muted">
            {session.firmName}
          </div>
          <div className="mt-1 text-xl font-semibold tracking-tight">
            ProContador OS
          </div>
          <p className="mt-2 text-xs text-text-muted leading-relaxed">
            {session.name} · {session.role}
          </p>
        </div>
        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {NAV.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className="flex items-center gap-3 rounded-md px-3 py-2.5 text-sm text-text-muted hover:bg-bg-soft hover:text-text transition-colors"
            >
              <Icon size={16} strokeWidth={1.75} />
              {label}
            </Link>
          ))}
        </nav>
        <div className="p-4 border-t border-border flex items-center justify-between">
          <span className="text-xs text-text-muted">Operacional</span>
          <LogoutButton />
        </div>
      </aside>
      <main className="flex-1 min-w-0 overflow-auto">
        <div className="max-w-6xl mx-auto px-8 py-8">{children}</div>
      </main>
    </div>
  );
}
