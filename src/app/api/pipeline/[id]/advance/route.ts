import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { readSession } from "@/lib/auth";
import { nextStage } from "@/lib/domain/pipeline";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(_req: Request, ctx: Ctx) {
  const session = await readSession();
  if (!session) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const { id } = await ctx.params;

  const pipeline = await prisma.fiscalPipeline.findFirst({
    where: { id, firmId: session.firmId },
    include: { task: true },
  });

  if (!pipeline) {
    return NextResponse.json({ error: "Pipeline não encontrado" }, { status: 404 });
  }

  if (pipeline.stage === "CLOSE" && pipeline.stageStatus === "DONE") {
    return NextResponse.json({ error: "Já finalizado" }, { status: 400 });
  }

  // Complete current stage, move to next (human-in-the-loop approval)
  const nxt = nextStage(pipeline.stage);

  if (!nxt) {
    await prisma.$transaction([
      prisma.fiscalPipeline.update({
        where: { id },
        data: { stage: "CLOSE", stageStatus: "DONE" },
      }),
      ...(pipeline.taskId
        ? [
            prisma.task.update({
              where: { id: pipeline.taskId },
              data: { status: "DONE", completedAt: new Date() },
            }),
          ]
        : []),
      prisma.obligation.updateMany({
        where: { taskId: pipeline.taskId ?? undefined },
        data: { status: "PAID", paidAt: new Date() },
      }),
    ]);
    return NextResponse.json({ stage: "CLOSE", stageStatus: "DONE" });
  }

  // Side effects by stage transition (simplified MVP)
  if (pipeline.stage === "GUIDE" && pipeline.taskId) {
    await prisma.obligation.updateMany({
      where: { taskId: pipeline.taskId },
      data: { status: "SENT", sentAt: new Date() },
    });
  }
  if (pipeline.stage === "PAY" && pipeline.taskId) {
    await prisma.obligation.updateMany({
      where: { taskId: pipeline.taskId },
      data: { status: "PAID", paidAt: new Date(), proofUrl: "demo://comprovante" },
    });
  }

  const updated = await prisma.fiscalPipeline.update({
    where: { id },
    data: {
      stage: nxt,
      stageStatus: nxt === "CLOSE" ? "DONE" : "NEEDS_APPROVAL",
    },
  });

  if (nxt === "CLOSE" && pipeline.taskId) {
    await prisma.task.update({
      where: { id: pipeline.taskId },
      data: { status: "DONE", completedAt: new Date() },
    });
  }

  return NextResponse.json({
    stage: updated.stage,
    stageStatus: updated.stageStatus,
  });
}
