import { redirect } from "next/navigation";
import { requireClientSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { SignContractButton } from "@/components/sign-contract-button";
import { format } from "date-fns";

export const dynamic = "force-dynamic";

export default async function PortalAssinaturasPage() {
  let session;
  try {
    session = await requireClientSession();
  } catch {
    redirect("/portal/login");
  }

  const contracts = await prisma.contract.findMany({
    where: {
      firmId: session.firmId,
      clientId: session.clientId!,
      status: { in: ["SENT", "SIGNED", "DRAFT"] },
    },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-xl font-semibold">Assinaturas</h1>
        <p className="text-sm text-text-muted mt-1">
          Baixe/assine e envie o PDF assinado (prova real)
        </p>
      </header>

      <ul className="space-y-4">
        {contracts.map((c) => (
          <li
            key={c.id}
            className="rounded-lg border border-border bg-bg-elevated p-4 space-y-3"
          >
            <div>
              <div className="font-medium">
                {c.title}{" "}
                <span className="text-text-muted text-sm">({c.kind})</span>
              </div>
              <div className="text-xs text-text-muted mt-1">
                {c.status} · {format(c.createdAt, "dd/MM/yyyy")}
              </div>
            </div>
            {c.status === "SIGNED" ? (
              <p className="text-sm text-accent">Assinado</p>
            ) : (
              <SignContractButton contractId={c.id} />
            )}
          </li>
        ))}
        {contracts.length === 0 && (
          <p className="text-sm text-text-muted">Nenhum documento pendente</p>
        )}
      </ul>
    </div>
  );
}
