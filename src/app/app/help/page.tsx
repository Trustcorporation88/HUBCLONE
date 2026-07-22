import Link from "next/link";
import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { MODULE_HELP } from "@/lib/domain/module-help";
import { OfficeChat } from "@/components/office-chat";

export const dynamic = "force-dynamic";

export default async function HelpPage() {
  let session;
  try {
    session = await requireSession();
  } catch {
    redirect("/login");
  }
  if (session.role === "CLIENT") redirect("/portal");

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold">Ajuda do escritório</h1>
        <p className="mt-1 max-w-2xl text-sm text-text-muted">
          Explicação de cada serviço para o contador operar o ProContador OS —
          e um assistente com OpenAI para tirar dúvidas na hora.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <section className="space-y-4">
          <h2 className="text-lg font-medium">Serviços do sistema</h2>
          {MODULE_HELP.map((m) => (
            <article
              key={m.href}
              className="rounded-lg border border-border bg-bg-elevated p-5"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-[10px] uppercase tracking-[0.2em] text-text-muted">
                    {m.nav}
                  </p>
                  <h3 className="mt-1 font-medium">{m.title}</h3>
                </div>
                <Link
                  href={m.href}
                  className="rounded-md border border-border px-3 py-1.5 text-xs hover:bg-bg-soft"
                >
                  Abrir
                </Link>
              </div>
              <p className="mt-2 text-sm text-text-muted leading-relaxed">
                {m.summary}
              </p>
              <p className="mt-2 text-xs text-text-muted">
                <span className="text-text">Para quem:</span> {m.forWhom}
              </p>
              <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm text-text-muted">
                {m.howToStart.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
              {m.tips.length > 0 && (
                <ul className="mt-3 space-y-1 text-xs text-accent/90">
                  {m.tips.map((t) => (
                    <li key={t}>• {t}</li>
                  ))}
                </ul>
              )}
            </article>
          ))}
        </section>

        <aside className="lg:sticky lg:top-8 lg:self-start space-y-3">
          <h2 className="text-lg font-medium">Chat de dúvidas</h2>
          <OfficeChat />
          <p className="text-xs text-text-muted leading-relaxed">
            Precisa da chave em{" "}
            <Link href="/app/integrations" className="text-accent underline">
              Integrações → OpenAI
            </Link>{" "}
            ou variável <code className="text-accent">OPENAI_API_KEY</code> no
            Railway.
          </p>
        </aside>
      </div>
    </div>
  );
}
