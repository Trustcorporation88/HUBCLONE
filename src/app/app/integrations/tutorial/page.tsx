import Link from "next/link";
import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function IntegracoesTutorialPage() {
  let session;
  try {
    session = await requireSession();
  } catch {
    redirect("/login");
  }
  if (session.role === "CLIENT") redirect("/portal");

  return (
    <div className="space-y-8 max-w-3xl">
      <header className="space-y-3">
        <p className="text-xs uppercase tracking-[0.2em] text-text-muted">
          Tutorial
        </p>
        <h1 className="text-2xl font-semibold">
          Integrar Omie e Domínio no ProContador OS
        </h1>
        <p className="text-sm text-text-muted">
          Guia operacional para o escritório piloto. Sem passos fictícios.
        </p>
        <div className="flex flex-wrap gap-3">
          <a
            href="/tutoriais/integracao-omie-dominio.md"
            download="ProContador-OS-Tutorial-Omie-Dominio.md"
            className="rounded-md bg-accent text-bg px-4 py-2 text-sm font-medium"
          >
            Baixar tutorial (.md)
          </a>
          <a
            href="/tutoriais/modelo-clientes-dominio.csv"
            download="modelo-clientes-dominio.csv"
            className="rounded-md border border-border px-4 py-2 text-sm hover:bg-bg-soft"
          >
            Baixar modelo CSV Domínio
          </a>
          <Link
            href="/app/integrations"
            className="rounded-md border border-border px-4 py-2 text-sm hover:bg-bg-soft"
          >
            Ir para Integrações
          </Link>
        </div>
      </header>

      <section className="space-y-3 text-sm leading-relaxed">
        <h2 className="text-lg font-medium">Omie</h2>
        <ol className="list-decimal pl-5 space-y-2 text-text-muted">
          <li>
            No Omie, copie <strong className="text-text">App Key</strong> e{" "}
            <strong className="text-text">App Secret</strong> (área do
            desenvolvedor).
          </li>
          <li>
            Em Integrações → Omie, cole as chaves e clique em{" "}
            <strong className="text-text">Conectar e testar</strong>.
          </li>
          <li>
            Com status CONNECTED, clique em{" "}
            <strong className="text-text">Importar clientes Omie</strong>.
          </li>
          <li>Clientes entram/atualizam por CNPJ (API oficial ListarClientes).</li>
        </ol>
      </section>

      <section className="space-y-3 text-sm leading-relaxed">
        <h2 className="text-lg font-medium">Domínio Contábil</h2>
        <p className="text-text-muted">
          Domínio não tem API pública simples. No piloto use CSV:
        </p>
        <ol className="list-decimal pl-5 space-y-2 text-text-muted">
          <li>Exporte empresas/clientes do Domínio para Excel/CSV.</li>
          <li>
            Cabeçalho sugerido:{" "}
            <code className="text-accent">
              cnpj;razao_social;nome_fantasia;email;regime
            </code>
          </li>
          <li>
            Em Integrações → Domínio →{" "}
            <strong className="text-text">Importar CSV Domínio</strong>.
          </li>
          <li>
            API parceiro (baseUrl + token) só se a Trust tiver credencial
            Thomson/Onvio.
          </li>
        </ol>
      </section>

      <p className="text-xs text-text-muted">
        Tutorial completo (checklist, erros comuns, segurança) está no arquivo
        para download.
      </p>
    </div>
  );
}
