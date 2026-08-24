import { NextResponse } from "next/server";
import { readSession } from "@/lib/auth";
import { ensureGuideFile } from "@/lib/delivery";

type Ctx = { params: Promise<{ id: string }> };

/** Download do arquivo da guia para anexar no WhatsApp manualmente */
export async function GET(_req: Request, ctx: Ctx) {
  const session = await readSession();
  if (!session) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const { id } = await ctx.params;
  const result = await ensureGuideFile({
    firmId: session.firmId,
    firmName: session.brandName || session.firmName,
    obligationId: id,
  });

  if ("error" in result && result.error) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  if (session.role === "CLIENT" && session.clientId) {
    if (result.obligation!.clientId !== session.clientId) {
      return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
    }
  }

  // The guide is deterministic plain text generated on demand and persisted to
  // Supabase Storage by ensureGuideFile; serve the freshly built content.
  return new NextResponse(result.content!, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": `attachment; filename="${result.fileName}"`,
    },
  });
}
