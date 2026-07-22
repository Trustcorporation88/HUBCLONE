import { NextResponse } from "next/server";
import { readSession } from "@/lib/auth";
import { getAdvisorySummary } from "@/lib/fiscal-health";

export async function GET(req: Request) {
  const session = await readSession();
  if (!session) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const url = new URL(req.url);
  const clientIdParam = url.searchParams.get("clientId");
  const clientId =
    session.role === "CLIENT" ? session.clientId : clientIdParam;

  if (!clientId) {
    return NextResponse.json({ error: "clientId obrigatório" }, { status: 400 });
  }

  if (session.role === "CLIENT" && session.clientId !== clientId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const months = Number(url.searchParams.get("months") ?? "6");
  const summary = await getAdvisorySummary({
    firmId: session.firmId,
    clientId,
    months: Number.isFinite(months) ? months : 6,
  });

  return NextResponse.json({ summary });
}
