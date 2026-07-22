import { NextResponse } from "next/server";
import { readSession } from "@/lib/auth";
import { syncOmieClients } from "@/lib/integrations/omie";

export async function POST() {
  const session = await readSession();
  if (!session || session.role === "CLIENT") {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const result = await syncOmieClients(session.firmId);
  if ("error" in result && result.error) {
    return NextResponse.json(
      { error: result.error },
      { status: "status" in result ? result.status : 400 },
    );
  }

  return NextResponse.json(result);
}
