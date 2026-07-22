import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { getSlaMonitor } from "@/lib/sla";
import { format } from "date-fns";

export const dynamic = "force-dynamic";

export default async function SlaPage() {
  let session;
  try {
    session = await requireSession();
  } catch {
    redirect("/login");
  }
  if (session.role === "CLIENT") redirect("/portal");

  const { policies, rows, lateCount, onTimeCount } = await getSlaMonitor(
    session.firmId,
  );

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold">SLA WhatsApp / e-mail</h1>
        <p className="text-sm text-text-muted mt-1">
          Monitoramento dos envios de guia · on-time {onTimeCount} · late{" "}
          {lateCount}
        </p>
      </header>

      <section className="rounded-lg border border-border bg-bg-elevated p-5">
        <h2 className="font-medium mb-3">Políticas</h2>
        <ul className="text-sm space-y-1">
          {policies.map((p) => (
            <li key={p.id}>
              {p.channel} / {p.department}:{" "}
              <strong>{p.targetHours}h</strong> alvo
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-lg border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-bg-elevated text-text-muted text-left">
            <tr>
              <th className="px-4 py-3">Cliente</th>
              <th className="px-4 py-3">Canal</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Horas</th>
              <th className="px-4 py-3">SLA</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.deliveryId} className="border-t border-border">
                <td className="px-4 py-3">{r.clientName}</td>
                <td className="px-4 py-3">{r.channel}</td>
                <td className="px-4 py-3">{r.status}</td>
                <td className="px-4 py-3">
                  {r.hoursElapsed}h / {r.targetHours}h
                  <div className="text-xs text-text-muted">
                    {format(r.createdAt, "dd/MM HH:mm")}
                  </div>
                </td>
                <td className="px-4 py-3">
                  {r.late ? (
                    <span className="text-danger">LATE</span>
                  ) : r.onTime ? (
                    <span className="text-accent">OK</span>
                  ) : (
                    <span className="text-text-muted">em curso</span>
                  )}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-text-muted">
                  Nenhum envio ainda
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
