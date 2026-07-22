import { NextResponse } from "next/server";
import { readSession } from "@/lib/auth";
import { markDeliveryViewed } from "@/lib/delivery";

type Ctx = { params: Promise<{ id: string }> };

/** Simula o cliente abrindo a guia (rastreio VIEWED) */
export async function POST(_req: Request, ctx: Ctx) {
  const session = await readSession();
  if (!session) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
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
