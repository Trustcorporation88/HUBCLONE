import { prisma } from "@/lib/db";
import { requireClientSession } from "@/lib/auth";
import { formatBrl } from "@/lib/utils";
import Link from "next/link";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function PortalHomePage() {
  let session;
  try {
    session = await requireClientSession();
  } catch {
    redirect("/portal/login");
  }

  const clientId = session.clientId!;
  const [client, openGuides, paidGuides, xmlCount] = await Promise.all([
    prisma.client.findFirst({
      where: { id: clientId, firmId: session.firmId },
    }),
    prisma.obligation.count({
      where: {
        firmId: session.firmId,
        clientId,
        status: { in: ["READY", "SENT", "VIEWED", "OVERDUE"] },
      },
    }),
    prisma.obligation.count({
      where: { firmId: session.firmId, clientId, status: "PAID" },
    }),
    prisma.xmlDocument.count({
      where: { firmId: session.firmId, clientId },
    }),
  ]);

  const nextGuide = await prisma.obligation.findFirst({
    where: {
      firmId: session.firmId,
      clientId,
      status: { in: ["READY", "SENT", "VIEWED", "OVERDUE"] },
    },
    orderBy: { dueAt: "asc" },
  });

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">
          Olá, {client?.tradeName ?? client?.legalName ?? session.name}
        </h1>
        <p className="text-sm text-text-muted mt-1">
          Tudo do seu escritório {session.brandName} em um só lugar.
        </p>
      </header>

      <div className="grid grid-cols-3 gap-3">
        <Stat label="Guias abertas" value={String(openGuides)} />
        <Stat label="Pagas" value={String(paidGuides)} />
        <Stat label="XMLs" value={String(xmlCount)} />
      </div>

      {nextGuide && (
        <section className="rounded-lg border border-border bg-bg-elevated p-5">
          <div className="text-xs text-text-muted uppercase tracking-wide">
            Próxima guia
          </div>
          <div className="mt-2 text-lg font-medium">
            {nextGuide.type} · {nextGuide.competence}
          </div>
          <p className="text-sm text-text-muted mt-1">
            {formatBrl(nextGuide.amountCents)} · status {nextGuide.status}
          </p>
          <Link
            href="/portal/guias"
            className="inline-block mt-4 rounded-md bg-accent text-bg px-4 py-2 text-sm font-medium"
          >
            Ver e pagar
          </Link>
        </section>
      )}

      <section className="grid grid-cols-2 gap-3">
        <Link
          href="/portal/guias"
          className="rounded-lg border border-border p-4 hover:border-accent"
        >
          <div className="font-medium">Guias</div>
          <p className="text-xs text-text-muted mt-1">Enviadas e pagamento</p>
        </Link>
        <Link
          href="/portal/xml"
          className="rounded-lg border border-border p-4 hover:border-accent"
        >
          <div className="font-medium">Notas fiscais</div>
          <p className="text-xs text-text-muted mt-1">XML compra e venda</p>
        </Link>
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-bg-elevated p-3">
      <div className="text-[10px] uppercase tracking-wide text-text-muted">
        {label}
      </div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
    </div>
  );
}
