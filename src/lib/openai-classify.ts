import { requireEnv } from "@/lib/runtime";

export type InboxClassification =
  | "DAS"
  | "NFE"
  | "CONTRACT"
  | "PROOF"
  | "OTHER";

export type ClassifyResult = {
  classification: InboxClassification;
  confidence: number;
  summary: string;
  raw: unknown;
};

const ALLOWED: InboxClassification[] = [
  "DAS",
  "NFE",
  "CONTRACT",
  "PROOF",
  "OTHER",
];

export async function classifyInboxWithOpenAI(opts: {
  filename: string;
  mimeType: string;
  textExcerpt?: string;
  apiKey?: string;
}): Promise<ClassifyResult> {
  const apiKey = opts.apiKey?.trim() || requireEnv("OPENAI_API_KEY");
  const model = process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini";

  const prompt = [
    "Classifique o documento fiscal/contábil brasileiro em UMA categoria:",
    "DAS | NFE | CONTRACT | PROOF | OTHER",
    "Responda APENAS JSON: {\"classification\":\"...\",\"confidence\":0-1,\"summary\":\"...\"}",
    `Arquivo: ${opts.filename}`,
    `MIME: ${opts.mimeType}`,
    opts.textExcerpt ? `Trecho: ${opts.textExcerpt.slice(0, 2000)}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "Você classifica documentos para um escritório de contabilidade brasileiro.",
        },
        { role: "user", content: prompt },
      ],
    }),
  });

  const raw = await res.json().catch(() => null);
  if (!res.ok) {
    const msg =
      (raw as { error?: { message?: string } })?.error?.message ??
      `OpenAI HTTP ${res.status}`;
    throw new Error(msg);
  }

  const content = (raw as { choices?: Array<{ message?: { content?: string } }> })
    ?.choices?.[0]?.message?.content;
  if (!content) throw new Error("OpenAI não retornou classificação");

  let parsed: {
    classification?: string;
    confidence?: number;
    summary?: string;
  };
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error("Resposta OpenAI inválida (JSON)");
  }

  const classification = String(parsed.classification ?? "OTHER").toUpperCase();
  const safe = ALLOWED.includes(classification as InboxClassification)
    ? (classification as InboxClassification)
    : "OTHER";

  return {
    classification: safe,
    confidence: Math.min(1, Math.max(0, Number(parsed.confidence ?? 0.5))),
    summary: String(parsed.summary ?? ""),
    raw,
  };
}
