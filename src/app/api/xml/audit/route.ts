import { NextResponse } from "next/server";
import { z } from "zod";
import { readSession } from "@/lib/auth";
import { runXmlAuditForClient } from "@/lib/xml-audit";

const bodySchema = z.object({
  clientId: z.string().min(1),
});

export async function POST(req: Request) {
  const session = await readSession();
  if (!session || session.role === "CLIENT") {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "clientId obrigatório" }, { status: 400 });
  }

  const result = await runXmlAuditForClient({
    firmId: session.firmId,
    clientId: parsed.data.clientId,
  });

  if ("error" in result && result.error) {
    return NextResponse.json(
      { error: result.error },
      { status: result.status ?? 400 },
    );
  }

  return NextResponse.json(result);
}
