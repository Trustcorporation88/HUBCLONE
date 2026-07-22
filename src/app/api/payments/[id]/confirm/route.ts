import { NextResponse } from "next/server";
import { readSession } from "@/lib/auth";
import { confirmGuidePayment } from "@/lib/payment";

type Ctx = { params: Promise<{ id: string }> };

/** Confirma pagamento (mock webhook / botão "já paguei") */
export async function POST(_req: Request, ctx: Ctx) {
  const session = await readSession();
  if (!session) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const { id } = await ctx.params;
  const result = await confirmGuidePayment({
    firmId: session.firmId,
    paymentId: id,
  });

  if ("error" in result && result.error) {
    return NextResponse.json({ error: result.error }, { status: result.status ?? 400 });
  }

  return NextResponse.json(result);
}
