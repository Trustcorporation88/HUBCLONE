import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { readSession } from "@/lib/auth";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, ctx: Ctx) {
  const session = await readSession();
  if (!session) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const { id } = await ctx.params;
  const contract = await prisma.contract.findFirst({
    where: {
      id,
      firmId: session.firmId,
      ...(session.role === "CLIENT" && session.clientId
        ? { clientId: session.clientId }
        : {}),
    },
  });
  if (!contract) {
    return NextResponse.json({ error: "Contrato não encontrado" }, { status: 404 });
  }
  if (!["SENT", "DRAFT"].includes(contract.status)) {
    return NextResponse.json(
      { error: "Contrato já assinado ou rejeitado" },
      { status: 400 },
    );
  }

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json(
      { error: "Envie o PDF assinado (campo file)" },
      { status: 400 },
    );
  }

  const ext = (file.name.split(".").pop() || "pdf").toLowerCase();
  if (ext !== "pdf") {
    return NextResponse.json(
      { error: "Apenas PDF assinado é aceito" },
      { status: 400 },
    );
  }

  const dir = path.join(
    process.cwd(),
    "data",
    "signatures",
    session.firmId,
  );
  await mkdir(dir, { recursive: true });
  const filePath = path.join(dir, `${contract.id}.pdf`);
  const buf = Buffer.from(await file.arrayBuffer());
  await writeFile(filePath, buf);

  const updated = await prisma.contract.update({
    where: { id: contract.id },
    data: {
      status: "SIGNED",
      signedPdfPath: filePath,
      signedAt: new Date(),
    },
  });

  return NextResponse.json({ contract: updated });
}
