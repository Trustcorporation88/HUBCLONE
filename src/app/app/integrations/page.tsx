import Link from "next/link";
import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { INTEGRATION_PROVIDERS } from "@/lib/integrations";
import { IntegrationConnectForm } from "@/components/integration-connect-form";
import {
  DominioCsvImport,
  OmieSyncButton,
  ProContadorSyncButton,
} from "@/components/integration-sync";

export const dynamic = "force-dynamic";

const LABELS: Record<string, { title: string; desc: string }> = {
  PROCONTADOR: {
    title: "ProContador",
    desc: "www.procontador.com.br — importa empresas do SaaS para o OS",
  },
  DOMINIO: {
    title: "Domínio Sistemas",
    desc: "Import CSV agora · API parceiro quando houver token Thomson/Onvio",
  },
  OMIE: {
    title: "Omie",
    desc: "Conecte App Key/Secret e importe clientes pela API oficial",
  },
  CLICKSIGN: {
    title: "ClickSign",
    desc: "Assinatura eletrônica via API (token real)",
  },
  OPENAI: {
    title: "OpenAI",
    desc: "Inbox + Assistente (Ajuda) — também OPENAI_API_KEY no Railway",
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
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Marketplace de integrações</h1>
          <p className="text-sm text-text-muted mt-1">
            Conectores reais — sem credencial = desconectado (zero mock)
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/app/integrations/tutorial"
            className="rounded-md border border-border px-4 py-2 text-sm hover:bg-bg-soft"
          >
            Ver tutorial
          </Link>
          <a
            href="/tutoriais/integracao-omie-dominio.md"
            download="ProContador-OS-Tutorial-Omie-Dominio.md"
            className="rounded-md bg-accent text-bg px-4 py-2 text-sm font-medium"
          >
            Baixar tutorial
          </a>
        </div>
      </header>

      <div className="grid md:grid-cols-2 gap-4">
        {INTEGRATION_PROVIDERS.map((provider) => {
          const row = byProvider.get(provider);
          const meta = LABELS[provider];
          const connected = row?.status === "CONNECTED";
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
              {row?.lastSyncAt && (
                <p className="text-xs text-text-muted mt-1">
                  Último sync: {row.lastSyncAt.toISOString()}
                </p>
              )}
              {provider !== "DOMINIO" && (
                <IntegrationConnectForm provider={provider} />
              )}
              {provider === "PROCONTADOR" && (
                <ProContadorSyncButton
                  enabled={Boolean(connected || row?.credentialsEnc)}
                />
              )}
              {provider === "OMIE" && (
                <OmieSyncButton
                  enabled={Boolean(connected || row?.credentialsEnc)}
                />
              )}
              {provider === "DOMINIO" && (
                <>
                  <DominioCsvImport />
                  <details className="mt-3 text-xs text-text-muted">
                    <summary className="cursor-pointer text-accent">
                      Tenho API parceiro Domínio?
                    </summary>
                    <div className="mt-2">
                      <IntegrationConnectForm provider="DOMINIO" />
                    </div>
                  </details>
                </>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
