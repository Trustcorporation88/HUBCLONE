import { NextResponse } from "next/server";
import { z } from "zod";
import { readSession } from "@/lib/auth";
import { createGuidePayment } from "@/lib/payment";

type Ctx = { params: Promise<{ id: string }> };

const bodySchema = z.object({
  method: z.enum(["PIX", "BOLETO"]),
});

export async function POST(req: Request, ctx: Ctx) {
  const session = await readSession();
  if (!session) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const { id } = await ctx.params;
  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Informe method PIX ou BOLETO" }, { status: 400 });
  }

  const result = await createGuidePayment({
    firmId: session.firmId,
    firmName: session.firmName,
    obligationId: id,
    method: parsed.data.method,
    clientId: session.role === "CLIENT" ? session.clientId : null,
  });

  if ("error" in result && result.error) {
    return NextResponse.json({ error: result.error }, { status: result.status ?? 400 });
  }

  return NextResponse.json(result);
}
