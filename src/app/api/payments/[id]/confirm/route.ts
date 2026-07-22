import { NextResponse } from "next/server";
import { readSession } from "@/lib/auth";
import { confirmGuidePayment } from "@/lib/payment";

type Ctx = { params: Promise<{ id: string }> };

/** Confirma pagamento com upload obrigatório do comprovante */
export async function POST(req: Request, ctx: Ctx) {
  const session = await readSession();
  if (!session) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const { id } = await ctx.params;
  const form = await req.formData();
  const file = form.get("proof") as File | null;
  if (!file) {
    return NextResponse.json(
      { error: "Anexo proof obrigatório (PDF/JPG/PNG)" },
      { status: 400 },
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const result = await confirmGuidePayment({
    firmId: session.firmId,
    paymentId: id,
    clientId: session.role === "CLIENT" ? session.clientId : null,
    proof: { buffer, filename: file.name || "comprovante.pdf" },
  });

  if ("error" in result && result.error) {
    return NextResponse.json({ error: result.error }, { status: result.status ?? 400 });
  }

  return NextResponse.json(result);
}
