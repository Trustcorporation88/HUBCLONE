import { requireStaffSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { FirmSettingsForm } from "@/components/firm-settings-form";

export const dynamic = "force-dynamic";

export default async function EscritorioPage() {
  const session = await requireStaffSession();
  const firm = await prisma.firm.findUniqueOrThrow({
    where: { id: session.firmId },
    select: { name: true, slug: true, brandName: true, brandTagline: true },
  });

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-xl font-semibold">Escritório</h1>
        <p className="text-sm text-text-muted mt-1">
          Identificação usada no portal do cliente e na comunicação.
        </p>
      </header>

      {session.role !== "OWNER" ? (
        <p className="rounded-lg border border-border bg-bg-elevated p-5 text-sm text-text-muted">
          Apenas o OWNER pode alterar estes dados.
        </p>
      ) : (
        <FirmSettingsForm
          inicial={{
            name: firm.name,
            brandName: firm.brandName ?? firm.name,
            brandTagline: firm.brandTagline ?? "",
          }}
        />
      )}

      <p className="text-xs text-text-muted">
        Identificador interno: <code>{firm.slug}</code>. Ele não muda, porque é
        referência de outros registros.
      </p>
    </div>
  );
}
