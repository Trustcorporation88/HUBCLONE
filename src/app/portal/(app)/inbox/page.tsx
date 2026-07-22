import { redirect } from "next/navigation";
import { requireClientSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { InboxUploadForm } from "@/components/inbox-upload-form";
import { format } from "date-fns";

export const dynamic = "force-dynamic";

export default async function PortalInboxPage() {
  let session;
  try {
    session = await requireClientSession();
  } catch {
    redirect("/portal/login");
  }

  const items = await prisma.inboxItem.findMany({
    where: {
      firmId: session.firmId,
      clientId: session.clientId!,
    },
    orderBy: { createdAt: "desc" },
    take: 40,
  });

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-xl font-semibold">Inbox</h1>
        <p className="text-sm text-text-muted mt-1">
          Mande foto ou PDF — a IA classifica automaticamente
        </p>
      </header>

      <section className="rounded-lg border border-border bg-bg-elevated p-4">
        <InboxUploadForm fixedClientId={session.clientId!} />
      </section>

      <ul className="space-y-2 text-sm">
        {items.map((i) => (
          <li key={i.id} className="border-b border-border pb-2">
            <div className="font-medium">
              {i.filename} → {i.classification ?? "—"}
            </div>
            <div className="text-xs text-text-muted">
              {format(i.createdAt, "dd/MM HH:mm")}
              {i.note ? ` · ${i.note}` : ""}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
