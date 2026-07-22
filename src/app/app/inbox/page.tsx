import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { InboxUploadForm } from "@/components/inbox-upload-form";
import { format } from "date-fns";

export const dynamic = "force-dynamic";

export default async function AppInboxPage() {
  let session;
  try {
    session = await requireSession();
  } catch {
    redirect("/login");
  }
  if (session.role === "CLIENT") redirect("/portal");

  const [clients, items] = await Promise.all([
    prisma.client.findMany({
      where: { firmId: session.firmId, active: true },
      orderBy: { legalName: "asc" },
    }),
    prisma.inboxItem.findMany({
      where: { firmId: session.firmId },
      include: { client: true },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
  ]);

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold">Inbox inteligente</h1>
        <p className="text-sm text-text-muted mt-1">
          Upload → OpenAI classifica (DAS, NFe, contrato, comprovante…)
        </p>
      </header>

      <section className="rounded-lg border border-border bg-bg-elevated p-5">
        <InboxUploadForm
          clients={clients.map((c) => ({
            id: c.id,
            label: c.tradeName ?? c.legalName,
          }))}
        />
      </section>

      <ul className="divide-y divide-border border border-border rounded-lg text-sm">
        {items.map((i) => (
          <li key={i.id} className="px-4 py-3">
            <div className="font-medium">
              {i.filename}{" "}
              <span className="text-accent">{i.classification ?? "—"}</span>
            </div>
            <div className="text-xs text-text-muted">
              {i.client.tradeName ?? i.client.legalName} ·{" "}
              {i.confidence != null
                ? `${Math.round(i.confidence * 100)}%`
                : ""}{" "}
              · {format(i.createdAt, "dd/MM HH:mm")}
              {i.note ? ` · ${i.note}` : ""}
            </div>
          </li>
        ))}
        {items.length === 0 && (
          <li className="px-4 py-8 text-center text-text-muted">
            Inbox vazio
          </li>
        )}
      </ul>
    </div>
  );
}
