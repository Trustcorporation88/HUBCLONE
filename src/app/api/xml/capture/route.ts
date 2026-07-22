import { NextResponse } from "next/server";
import { z } from "zod";
import { readSession } from "@/lib/auth";
import { runXmlCapture } from "@/lib/sefaz/capture";

const bodySchema = z.object({
  clientId: z.string().min(1),
  forceMock: z.boolean().optional(),
});

export async function POST(req: Request) {
  const session = await readSession();
  if (!session) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "clientId obrigatório" }, { status: 400 });
  }

  const result = await runXmlCapture({
    firmId: session.firmId,
    clientId: parsed.data.clientId,
    forceMock: parsed.data.forceMock,
  });

  if ("error" in result && result.error && !("run" in result && result.run)) {
    return NextResponse.json({ error: result.error }, { status: result.status ?? 400 });
  }

  if ("error" in result && result.error) {
    return NextResponse.json(
      { error: result.error, run: result.run },
      { status: result.status ?? 502 },
    );
  }

  return NextResponse.json(result);
}
