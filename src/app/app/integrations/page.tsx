import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { INTEGRATION_PROVIDERS } from "@/lib/integrations";
import { IntegrationConnectForm } from "@/components/integration-connect-form";

export const dynamic = "force-dynamic";

const LABELS: Record<string, { title: string; desc: string }> = {
  DOMINIO: {
    title: "Domínio Sistemas",
    desc: "ERP contábil — exige baseUrl + apiToken do parceiro",
  },
  OMIE: {
    title: "Omie",
    desc: "ERP — app_key + app_secret (API oficial)",
  },
  CLICKSIGN: {
    title: "ClickSign",
    desc: "Assinatura eletrônica via API (token real)",
  },
  OPENAI: {
    title: "OpenAI",
    desc: "Classificação do inbox — também defina OPENAI_API_KEY no env",
  },
};

export default async function IntegrationsPage() {
  let session;
  try {
    session = await requireSession();
  } catch {
    redirect("/login");
  }
  if (session.role === "CLIENT") redirect("/portal");

  const existing = await prisma.integration.findMany({
    where: { firmId: session.firmId },
  });
  const byProvider = new Map(existing.map((i) => [i.provider, i]));

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold">Marketplace de integrações</h1>
        <p className="text-sm text-text-muted mt-1">
          Conectores reais — sem credencial = desconectado (zero mock)
        </p>
      </header>

      <div className="grid md:grid-cols-2 gap-4">
        {INTEGRATION_PROVIDERS.map((provider) => {
          const row = byProvider.get(provider);
          const meta = LABELS[provider];
          return (
            <section
              key={provider}
              className="rounded-lg border border-border bg-bg-elevated p-5"
            >
              <div className="flex justify-between items-start gap-2">
                <div>
                  <h2 className="font-medium">{meta.title}</h2>
                  <p className="text-xs text-text-muted mt-1">{meta.desc}</p>
                </div>
                <span className="text-xs uppercase tracking-wide text-text-muted">
                  {row?.status ?? "DISCONNECTED"}
                </span>
              </div>
              {row?.lastError && (
                <p className="text-xs text-danger mt-2">{row.lastError}</p>
              )}
              <IntegrationConnectForm provider={provider} />
            </section>
          );
        })}
      </div>
    </div>
  );
}
