import { BENCHMARK_STEALS, PIPELINE_STAGES, STAGE_LABELS, STAGE_SOURCES } from "@/lib/domain/pipeline";

export default function KnowledgePage() {
  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold">Base de conhecimento</h1>
        <p className="text-sm text-text-muted mt-1 max-w-2xl">
          Benchmarks BR + mundo embutidos no produto. Cada capacidade que
          construímos aponta para a fonte — para nunca virar “mais um HubStrom”.
        </p>
      </header>

      <section className="space-y-3">
        <h2 className="text-lg font-medium">O que pegamos de cada um</h2>
        <div className="rounded-lg border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-bg-soft text-text-muted text-left">
              <tr>
                <th className="px-4 py-3 font-medium">Fonte</th>
                <th className="px-4 py-3 font-medium">Capacidade</th>
                <th className="px-4 py-3 font-medium">Por quê</th>
              </tr>
            </thead>
            <tbody>
              {BENCHMARK_STEALS.map((s) => (
                <tr key={s.from} className="border-t border-border">
                  <td className="px-4 py-3 font-medium">{s.from}</td>
                  <td className="px-4 py-3">{s.capability}</td>
                  <td className="px-4 py-3 text-text-muted">{s.why}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-medium">Pipeline × origem</h2>
        <div className="grid md:grid-cols-2 gap-3">
          {PIPELINE_STAGES.map((s) => (
            <div
              key={s}
              className="rounded-lg border border-border bg-bg-elevated p-4"
            >
              <div className="text-xs text-accent uppercase tracking-wide">
                {s}
              </div>
              <div className="mt-1 font-medium">{STAGE_LABELS[s]}</div>
              <div className="mt-1 text-sm text-text-muted">
                Benchmark: {STAGE_SOURCES[s]}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
