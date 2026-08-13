import { NextResponse } from "next/server";
import { z } from "zod";
import { readSession } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";
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

  // Este e o unico endpoint do sistema que consome cota de um servico externo
  // com punicao real: a SEFAZ responde 656 (consumo indevido) e bloqueia o CNPJ
  // por uma hora. Login, chat e inbox ja tinham limite; a captura, nao.
  // 6 tentativas por hora por cliente e folgado para uso legitimo (a propria NT
  // recomenda 1 consulta/hora quando nao ha documento novo) e corta a repeticao
  // nervosa que gera o bloqueio.
  const rate = checkRateLimit(
    `capture:${session.firmId}:${parsed.data.clientId}`,
    { limit: 6, windowMs: 60 * 60_000 },
  );
  if (!rate.allowed) {
    const minutos = Math.ceil(rate.retryAfterMs / 60_000);
    return NextResponse.json(
      {
        error: `Muitas capturas seguidas para este cliente. Tente de novo em ${minutos} min — insistir agora faz a SEFAZ bloquear o CNPJ por consumo indevido.`,
      },
      {
        status: 429,
        headers: { "Retry-After": String(Math.ceil(rate.retryAfterMs / 1000)) },
      },
    );
  }

  const result = await runXmlCapture({
    firmId: session.firmId,
    clientId: parsed.data.clientId,
    kinds: parsed.data.kinds as CaptureKind[] | undefined,
    userId: session.userId,
  });

  if ("error" in result && result.error && result.status === 404) {
    return NextResponse.json({ error: result.error }, { status: 404 });
  }

  if ("error" in result && result.error && result.status === 409) {
    return NextResponse.json({ error: result.error }, { status: 409 });
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
