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

  const nxt = nextStage(pipeline.stage);

  if (!nxt) {
    if (pipeline.taskId) {
      const unpaid = await prisma.obligation.count({
        where: {
          taskId: pipeline.taskId,
          status: { not: "PAID" },
          NOT: { status: "CANCELLED" },
        },
      });
      if (unpaid > 0) {
        return NextResponse.json(
          {
            error:
              "Há guias sem pagamento confirmado (com comprovante). Não é possível fechar.",
          },
          { status: 400 },
        );
      }
    }

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
    ]);
    return NextResponse.json({ stage: "CLOSE", stageStatus: "DONE" });
  }

  if (pipeline.stage === "GUIDE" && pipeline.taskId) {
    await prisma.obligation.updateMany({
      where: { taskId: pipeline.taskId, status: "PENDING" },
      data: { status: "SENT", sentAt: new Date() },
    });
  }

  if (pipeline.stage === "PAY" && pipeline.taskId) {
    const unpaid = await prisma.obligation.count({
      where: {
        taskId: pipeline.taskId,
        status: { not: "PAID" },
        NOT: { status: "CANCELLED" },
      },
    });
    if (unpaid > 0) {
      return NextResponse.json(
        {
          error:
            "Confirme o pagamento com comprovante anexado antes de avançar. Não há confirmação automática/mock.",
        },
        { status: 400 },
      );
    }
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
