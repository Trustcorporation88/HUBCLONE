import { openAiModel } from "@/lib/openai-key";
import { moduleHelpAsSystemContext } from "@/lib/domain/module-help";

export type ChatMessage = { role: "user" | "assistant" | "system"; content: string };

const SYSTEM_PROMPT = `Você é o Assistente do ProContador Office (office.procontador.com.br), produto da Trust Corporation para escritórios contábeis no Brasil. Evite chamar o produto de "OS" — no Brasil OS significa ordem de serviço; o nome correto é ProContador Office.

Regras:
- Responda em português do Brasil, claro e objetivo (como treinar um contador no primeiro uso).
- Explique o que cada menu/serviço faz e o próximo passo prático.
- Nunca invente dados fiscais, PIX, certificados ou clientes.
- Se faltar configuração (SMTP, A1, OpenAI, ClickSign), diga exatamente onde configurar.
- Se a pergunta for fora do produto, diga educadamente e volte ao OS.
- Não peça senhas; se o usuário colar segredo, oriente a trocar.

Contexto dos módulos do sistema:
${moduleHelpAsSystemContext()}
`;

export async function askOfficeAssistant(opts: {
  apiKey: string;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
}): Promise<string> {
  const trimmed = opts.messages
    .map((m) => ({ role: m.role, content: m.content.trim() }))
    .filter((m) => m.content.length > 0)
    .slice(-16);

  if (trimmed.length === 0) {
    throw new Error("Envie uma pergunta.");
  }

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${opts.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: openAiModel(),
      temperature: 0.3,
      messages: [{ role: "system", content: SYSTEM_PROMPT }, ...trimmed],
    }),
  });

  const raw = (await res.json().catch(() => null)) as {
    choices?: Array<{ message?: { content?: string } }>;
    error?: { message?: string };
  } | null;

  if (!res.ok) {
    throw new Error(raw?.error?.message ?? `OpenAI HTTP ${res.status}`);
  }

  const content = raw?.choices?.[0]?.message?.content?.trim();
  if (!content) throw new Error("OpenAI não retornou resposta");
  return content;
}
