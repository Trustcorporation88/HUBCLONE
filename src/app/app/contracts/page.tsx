import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  ContractCreateForm,
  ContractSendButton,
} from "@/components/contract-forms";
import { format } from "date-fns";

export const dynamic = "force-dynamic";

export default async function ContractsPage() {
  let session;
  try {
    session = await requireSession();
  } catch {
    redirect("/login");
  }
  if (session.role === "CLIENT") redirect("/portal");

  const [clients, contracts] = await Promise.all([
    prisma.client.findMany({
      where: { firmId: session.firmId, active: true },
      orderBy: { legalName: "asc" },
    }),
    prisma.contract.findMany({
      where: { firmId: session.firmId },
      include: { client: true },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold">Contratos / OS</h1>
        <p className="text-sm text-text-muted mt-1">
          Pedido de assinatura — cliente envia PDF assinado no portal
        </p>
      </header>

      <section className="rounded-lg border border-border bg-bg-elevated p-5">
        <ContractCreateForm
          clients={clients.map((c) => ({
            id: c.id,
            label: c.tradeName ?? c.legalName,
          }))}
        />
      </section>

      <ul className="divide-y divide-border border border-border rounded-lg">
        {contracts.map((c) => (
          <li key={c.id} className="px-4 py-3 flex justify-between gap-4 text-sm">
            <div>
              <div className="font-medium">
                {c.title}{" "}
                <span className="text-text-muted font-normal">({c.kind})</span>
              </div>
              <div className="text-xs text-text-muted">
                {c.client.tradeName ?? c.client.legalName} · {c.status} ·{" "}
                {format(c.createdAt, "dd/MM/yyyy")}
              </div>
            </div>
            {c.status === "DRAFT" && <ContractSendButton id={c.id} />}
          </li>
        ))}
        {contracts.length === 0 && (
          <li className="px-4 py-8 text-center text-text-muted">
            Nenhum contrato
          </li>
        )}
      </ul>
    </div>
  );
}
