import { NextResponse } from "next/server";
import { requireStaffSession } from "@/lib/auth";
import { markDeliveryViewed } from "@/lib/delivery";

type Ctx = { params: Promise<{ id: string }> };

/** Simula o cliente abrindo a guia (rastreio VIEWED) — ação da equipe interna */
export async function POST(_req: Request, ctx: Ctx) {
  let session;
  try {
    session = await requireStaffSession();
  } catch {
    return NextResponse.json({ error: "Não autorizado" }, { status: 403 });
  }

  const { id } = await ctx.params;
  const result = await markDeliveryViewed({
    firmId: session.firmId,
    deliveryId: id,
  });

  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json(result);
}
