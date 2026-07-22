import { prisma } from "@/lib/db";
import { requireClientSession } from "@/lib/auth";
import { formatBrl } from "@/lib/utils";
import { format } from "date-fns";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function PortalXmlPage() {
  let session;
  try {
    session = await requireClientSession();
  } catch {
    redirect("/portal/login");
  }

  const docs = await prisma.xmlDocument.findMany({
    where: { firmId: session.firmId, clientId: session.clientId! },
    orderBy: { issuedAt: "desc" },
    take: 50,
  });

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Notas fiscais</h1>
        <p className="text-sm text-text-muted mt-1">
          XMLs de compra e venda capturados para a sua empresa.
        </p>
      </header>

      <div className="rounded-lg border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-bg-soft text-text-muted text-left">
            <tr>
              <th className="px-3 py-2 font-medium">Tipo</th>
              <th className="px-3 py-2 font-medium">Dir.</th>
              <th className="px-3 py-2 font-medium">Emissão</th>
              <th className="px-3 py-2 font-medium">Valor</th>
            </tr>
          </thead>
          <tbody>
            {docs.map((d) => (
              <tr key={d.id} className="border-t border-border">
                <td className="px-3 py-2">{d.docType}</td>
                <td className="px-3 py-2">{d.direction}</td>
                <td className="px-3 py-2 tabular-nums">
                  {d.issuedAt ? format(d.issuedAt, "dd/MM/yy") : "—"}
                </td>
                <td className="px-3 py-2 tabular-nums">
                  {formatBrl(d.amountCents)}
                </td>
              </tr>
            ))}
            {docs.length === 0 && (
              <tr>
                <td
                  colSpan={4}
                  className="px-3 py-8 text-center text-text-muted"
                >
                  Nenhuma nota ainda.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
