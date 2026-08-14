import { requireStaffSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { ehDonoDaPlataforma } from "@/lib/invites";
import { InviteManager } from "@/components/invite-manager";

export const dynamic = "force-dynamic";

export default async function ConvitesPage() {
  const session = await requireStaffSession();
  const dono = await ehDonoDaPlataforma(session);

  const convites = await prisma.firmInvite.findMany({
    where: dono
      ? { OR: [{ firmId: session.firmId }, { kind: "NEW_FIRM" }] }
      : { firmId: session.firmId },
    orderBy: { createdAt: "desc" },
    take: 30,
    select: {
      id: true,
      kind: true,
      role: true,
      email: true,
      expiresAt: true,
      usedAt: true,
      createdAt: true,
    },
  });

  const podeConvidar = session.role === "OWNER" || session.role === "MANAGER";

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-xl font-semibold">Convites</h1>
        <p className="text-sm text-text-muted mt-1">
          Única porta de entrada: não existe cadastro aberto neste endereço.
        </p>
      </header>

      {!podeConvidar ? (
        <p className="rounded-lg border border-border bg-bg-elevated p-5 text-sm text-text-muted">
          Apenas OWNER ou MANAGER podem emitir convites.
        </p>
      ) : (
        <InviteManager podeConvidarEscritorio={dono} />
      )}

      <section className="rounded-lg border border-border bg-bg-elevated">
        <div className="border-b border-border px-5 py-4">
          <h2 className="font-medium">Emitidos</h2>
        </div>
        {convites.length === 0 ? (
          <p className="px-5 py-6 text-sm text-text-muted">
            Nenhum convite emitido ainda.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-text-muted">
              <tr className="border-b border-border">
                <th className="px-5 py-2 font-normal">Tipo</th>
                <th className="px-5 py-2 font-normal">Para</th>
                <th className="px-5 py-2 font-normal">Papel</th>
                <th className="px-5 py-2 font-normal">Situação</th>
              </tr>
            </thead>
            <tbody>
              {convites.map((c) => {
                const expirado = !c.usedAt && c.expiresAt < new Date();
                return (
                  <tr key={c.id} className="border-b border-border last:border-0">
                    <td className="px-5 py-3">
                      {c.kind === "NEW_FIRM" ? "Escritório novo" : "Usuário"}
                    </td>
                    <td className="px-5 py-3 text-text-muted">
                      {c.email ?? "qualquer e-mail"}
                    </td>
                    <td className="px-5 py-3 text-text-muted">{c.role}</td>
                    <td className="px-5 py-3">
                      {c.usedAt ? (
                        <span className="text-text-muted">Aceito</span>
                      ) : expirado ? (
                        <span className="text-text-muted">Expirado</span>
                      ) : (
                        <span>Aguardando</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
