import { NextResponse } from "next/server";
import { z } from "zod";
import { readSession } from "@/lib/auth";
import { sendObligationGuide, type SendChannel } from "@/lib/delivery";

type Ctx = { params: Promise<{ id: string }> };

const bodySchema = z.object({
  channels: z
    .array(z.enum(["EMAIL", "WHATSAPP"]))
    .min(1)
    .default(["EMAIL", "WHATSAPP"]),
});

export async function POST(req: Request, ctx: Ctx) {
  const session = await readSession();
  if (!session) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const { id } = await ctx.params;
  const json = await req.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Canais inválidos" }, { status: 400 });
  }

  const result = await sendObligationGuide({
    firmId: session.firmId,
    firmName: session.firmName,
    obligationId: id,
    channels: parsed.data.channels as SendChannel[],
  });

  if ("error" in result && result.error) {
    return NextResponse.json(
      { error: result.error },
      { status: result.status ?? 400 },
    );
  }

  return NextResponse.json(result);
}
