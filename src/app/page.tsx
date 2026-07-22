import Link from "next/link";

export default function HomePage() {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-border px-8 py-5 flex items-center justify-between">
        <div>
          <div className="text-xs uppercase tracking-[0.2em] text-text-muted">
            Trust Corporation
          </div>
          <div className="text-2xl font-semibold mt-1">HUB Contábil OS</div>
        </div>
        <Link
          href="/app"
          className="rounded-md bg-accent text-bg px-4 py-2 text-sm font-medium hover:opacity-90"
        >
          Abrir escritório
        </Link>
      </header>

      <section className="relative flex-1 px-8 py-20 overflow-hidden">
        <div
          className="absolute inset-0 opacity-40 pointer-events-none"
          style={{
            backgroundImage:
              "radial-gradient(ellipse 80% 50% at 50% -20%, var(--accent-soft), transparent), linear-gradient(180deg, var(--bg) 0%, var(--bg-elevated) 100%)",
          }}
        />
        <div className="relative max-w-3xl">
          <p className="text-accent text-sm font-medium tracking-wide">
            Do zero · best-of-breed · Brasil + mundo
          </p>
          <h1 className="mt-4 text-4xl md:text-5xl font-semibold leading-tight tracking-tight">
            O único sistema que fecha a obrigação inteira.
          </h1>
          <p className="mt-5 text-lg text-text-muted max-w-xl leading-relaxed">
            Captura → audita → apura → guia → paga → prova → fecha tarefa.
            HubStrom junta pedaços. Nós juntamos o pipeline que Jettax, Qive,
            Dootax, Karbon e TaxDome nunca uniram.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/app/pipeline"
              className="rounded-md bg-accent text-bg px-5 py-2.5 text-sm font-medium"
            >
              Ver Fiscal Autopilot
            </Link>
            <Link
              href="/app/knowledge"
              className="rounded-md border border-border px-5 py-2.5 text-sm text-text-muted hover:text-text"
            >
              Base de conhecimento
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
