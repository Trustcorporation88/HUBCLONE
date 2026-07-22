import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import {
  PIPELINE_STAGES,
  STAGE_LABELS,
  STAGE_SOURCES,
  stageIndex,
} from "@/lib/domain/pipeline";
import { AdvancePipelineButton } from "./advance-button";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function PipelinePage() {
  let session;
  try {
    session = await requireSession();
  } catch {
    redirect("/login");
  }

  const pipelines = await prisma.fiscalPipeline.findMany({
    where: { firmId: session.firmId },
    include: { client: true, task: true },
    orderBy: { updatedAt: "desc" },
  });

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold">Fiscal Autopilot</h1>
        <p className="text-sm text-text-muted mt-1 max-w-2xl">
          O moat: um único evento percorre captura → auditoria → apuração → guia
          → pagamento → comprovante → fechamento da tarefa. Nenhum concorrente
          fecha isso ponta a ponta no Brasil.
        </p>
      </header>

      <div className="flex flex-wrap gap-2">
        {PIPELINE_STAGES.map((s) => (
          <div
            key={s}
            className="rounded-md border border-border bg-bg-elevated px-3 py-2 text-xs"
          >
            <div className="font-medium text-text">{STAGE_LABELS[s]}</div>
            <div className="text-text-muted mt-0.5">{STAGE_SOURCES[s]}</div>
          </div>
        ))}
      </div>

      <div className="space-y-4">
        {pipelines.map((p) => {
          const idx = stageIndex(p.stage);
          return (
            <article
              key={p.id}
              className="rounded-lg border border-border bg-bg-elevated p-5"
            >
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h2 className="font-medium text-lg">
                    {p.client.tradeName ?? p.client.legalName}
                  </h2>
                  <p className="text-sm text-text-muted mt-1">
                    {p.obligationType} · competência {p.competence}
                    {p.task ? ` · tarefa: ${p.task.title}` : null}
                  </p>
                </div>
                <AdvancePipelineButton
                  pipelineId={p.id}
                  stage={p.stage}
                  stageStatus={p.stageStatus}
                />
              </div>

              <ol className="mt-5 grid grid-cols-7 gap-1">
                {PIPELINE_STAGES.map((s, i) => {
                  const done = i < idx;
                  const current = i === idx;
                  return (
                    <li
                      key={s}
                      className={`rounded px-1 py-2 text-center text-[10px] leading-tight border ${
                        done
                          ? "border-success/40 bg-success/10 text-success"
                          : current
                            ? "border-accent bg-accent-soft text-accent"
                            : "border-border text-text-muted"
                      }`}
                    >
                      {STAGE_LABELS[s]}
                    </li>
                  );
                })}
              </ol>
            </article>
          );
        })}

        {pipelines.length === 0 && (
          <p className="text-text-muted text-sm">
            Sem pipelines. Execute <code>npm run db:setup</code>.
          </p>
        )}
      </div>
    </div>
  );
}
