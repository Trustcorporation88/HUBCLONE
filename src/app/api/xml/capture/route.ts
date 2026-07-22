import { NextResponse } from "next/server";
import { z } from "zod";
import { readSession } from "@/lib/auth";
import { runXmlCapture, type CaptureKind } from "@/lib/sefaz/capture";

const bodySchema = z.object({
  clientId: z.string().min(1),
  kinds: z
    .array(z.enum(["NFE", "CTE", "NFSE"]))
    .min(1)
    .optional(),
});

export async function POST(req: Request) {
  const session = await readSession();
  if (!session) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }
  if (session.role === "CLIENT") {
    return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
  }

  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "clientId obrigatório" }, { status: 400 });
  }

  const result = await runXmlCapture({
    firmId: session.firmId,
    clientId: parsed.data.clientId,
    kinds: parsed.data.kinds as CaptureKind[] | undefined,
  });

  if ("error" in result && result.error && result.status === 404) {
    return NextResponse.json({ error: result.error }, { status: 404 });
  }

  if ("error" in result && result.error && result.status === 400) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  if ("error" in result && result.error) {
    return NextResponse.json(
      { error: result.error, run: result.run },
      { status: result.status ?? 502 },
    );
  }

  return NextResponse.json(result);
}
