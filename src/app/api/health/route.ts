import { NextResponse } from "next/server";
import { getOpsStatus } from "@/lib/runtime";

export async function GET() {
  const status = getOpsStatus();
  return NextResponse.json(status, { status: status.ok ? 200 : 503 });
}
