import { NextResponse } from "next/server";
import { z } from "zod";
import { readSession } from "@/lib/auth";
import { resolveOpenAiKey } from "@/lib/openai-key";
import { askOfficeAssistant } from "@/lib/openai-chat";

const bodySchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().min(1).max(4000),
      }),
    )
    .min(1)
    .max(20),
});

export async function POST(req: Request) {
  const session = await readSession();
  if (!session) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }
  if (session.role === "CLIENT") {
    return NextResponse.json({ error: "Somente escritório" }, { status: 403 });
  }

  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Mensagens inválidas" }, { status: 400 });
  }

  try {
    const apiKey = await resolveOpenAiKey(session.firmId);
    const reply = await askOfficeAssistant({
      apiKey,
      messages: parsed.data.messages,
    });
    return NextResponse.json({ reply });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Falha no assistente";
    const status = message.includes("OPENAI_API_KEY") ? 400 : 502;
    return NextResponse.json({ error: message }, { status });
  }
}
