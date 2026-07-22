import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { formatBrl } from "@/lib/utils";
import { format } from "date-fns";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function XmlPage() {
  let session;
  try {
    session = await requireSession();
  } catch {
    redirect("/login");
  }

  const docs = await prisma.xmlDocument.findMany({
    where: { firmId: session.firmId },
    include: { client: true },
    orderBy: { issuedAt: "desc" },
  });

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">XML compra & venda</h1>
        <p className="text-sm text-text-muted mt-1">
          Captura contínua (Qive) + auditoria (BoxFiscal) antes de importar no
          engine.
        </p>
      </header>

      <div className="rounded-lg border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-bg-soft text-text-muted text-left">
            <tr>
              <th className="px-4 py-3 font-medium">Tipo</th>
              <th className="px-4 py-3 font-medium">Dir.</th>
              <th className="px-4 py-3 font-medium">Cliente</th>
              <th className="px-4 py-3 font-medium">Emissão</th>
              <th className="px-4 py-3 font-medium">Valor</th>
              <th className="px-4 py-3 font-medium">Audit</th>
            </tr>
          </thead>
          <tbody>
            {docs.map((d) => (
              <tr key={d.id} className="border-t border-border">
                <td className="px-4 py-3 font-medium">{d.docType}</td>
                <td className="px-4 py-3">{d.direction}</td>
                <td className="px-4 py-3">
                  {d.client.tradeName ?? d.client.legalName}
                </td>
                <td className="px-4 py-3 tabular-nums">
                  {d.issuedAt ? format(d.issuedAt, "dd/MM/yy") : "—"}
                </td>
                <td className="px-4 py-3 tabular-nums">
                  {formatBrl(d.amountCents)}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={
                      d.status === "WARNING" || d.status === "ERROR"
                        ? "text-warning"
                        : "text-success"
                    }
                  >
                    {d.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
