import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { formatBrl } from "@/lib/utils";
import { format } from "date-fns";
import { redirect } from "next/navigation";
import { CaptureButton, CertUploadForm } from "@/components/sefaz-capture";

export const dynamic = "force-dynamic";

export default async function XmlPage() {
  let session;
  try {
    session = await requireSession();
  } catch {
    redirect("/login");
  }

  const [docs, clients, certs, runs] = await Promise.all([
    prisma.xmlDocument.findMany({
      where: { firmId: session.firmId },
      include: { client: true },
      orderBy: { issuedAt: "desc" },
      take: 100,
    }),
    prisma.client.findMany({
      where: { firmId: session.firmId, active: true },
      orderBy: { legalName: "asc" },
    }),
    prisma.certificate.findMany({
      where: { firmId: session.firmId },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.captureRun.findMany({
      where: { firmId: session.firmId },
      include: { client: true },
      orderBy: { startedAt: "desc" },
      take: 8,
    }),
  ]);

  const clientOpts = clients.map((c) => ({
    id: c.id,
    label: `${c.tradeName ?? c.legalName} (${c.cnpj})`,
  }));

  const mode = process.env.SEFAZ_MODE ?? "auto";

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold">XML compra & venda</h1>
        <p className="text-sm text-text-muted mt-1">
          DistDFe NF-e + CT-e · NFS-e ADN · modo{" "}
          <code className="text-accent">{mode}</code> · marque os tipos e capture
        </p>
      </header>

      <section className="rounded-lg border border-border bg-bg-elevated p-5 space-y-4">
        <div>
          <h2 className="font-medium">Certificado A1</h2>
          <p className="text-xs text-text-muted mt-1">
            Upload do .pfx do cliente. Em <code>SEFAZ_MODE=live|auto</code> a
            captura chama o Ambiente Nacional; sem cert cai no mock.
          </p>
        </div>
        <CertUploadForm clients={clientOpts} />
        {certs.length > 0 && (
          <ul className="text-xs space-y-1 border-t border-border pt-3">
            {certs.map((c) => (
              <li key={c.id}>
                <span className="font-medium">{c.label}</span> · CNPJ {c.cnpj} ·
                amb {c.environment} · NSU {c.lastNsu}
                {c.validTo
                  ? ` · válido até ${format(c.validTo, "dd/MM/yyyy")}`
                  : null}
                {c.active ? "" : " · inativo"}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="font-medium">Capturar por cliente</h2>
        <div className="rounded-lg border border-border divide-y divide-border">
          {clients.map((c) => (
            <div
              key={c.id}
              className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
            >
              <div>
                <div className="text-sm font-medium">
                  {c.tradeName ?? c.legalName}
                </div>
                <div className="text-xs text-text-muted">{c.cnpj}</div>
              </div>
              <CaptureButton
                clientId={c.id}
                clientLabel={c.tradeName ?? c.legalName}
              />
            </div>
          ))}
        </div>
      </section>

      {runs.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-medium text-sm">Últimas capturas</h2>
          <ul className="text-xs text-text-muted space-y-1">
            {runs.map((r) => (
              <li key={r.id}>
                {format(r.startedAt, "dd/MM HH:mm")} ·{" "}
                {r.client.tradeName ?? r.client.legalName} · {r.mode} ·{" "}
                {r.status}
                {r.cStat ? ` · cStat ${r.cStat}` : ""}
                {r.docsSaved != null ? ` · ${r.docsSaved} salvos` : ""}
                {r.errorMessage ? ` · ${r.errorMessage}` : ""}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="space-y-3">
        <h2 className="font-medium">Documentos na base</h2>
        <div className="rounded-lg border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-bg-soft text-text-muted text-left">
              <tr>
                <th className="px-4 py-3 font-medium">Tipo</th>
                <th className="px-4 py-3 font-medium">Dir.</th>
                <th className="px-4 py-3 font-medium">Cliente</th>
                <th className="px-4 py-3 font-medium">Fonte</th>
                <th className="px-4 py-3 font-medium">Emissão</th>
                <th className="px-4 py-3 font-medium">Valor</th>
                <th className="px-4 py-3 font-medium">Status</th>
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
                  <td className="px-4 py-3 text-xs text-text-muted">
                    {d.schemaSource ?? "—"}
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
              {docs.length === 0 && (
                <tr>
                  <td
                    colSpan={7}
                    className="px-4 py-8 text-center text-text-muted"
                  >
                    Nenhum XML ainda — rode uma captura.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
