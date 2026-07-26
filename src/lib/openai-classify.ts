import { requireEnv } from "@/lib/runtime";
import { fetchWithTimeout } from "@/lib/fetch-timeout";

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

const CLASSIFY_PROMPT =
  'Classifique o documento fiscal/contabil brasileiro em UMA categoria: ' +
  'DAS | NFE | CONTRACT | PROOF | OTHER. ' +
  'Responda APENAS JSON: {"classification":"...","confidence":0-1,"summary":"..."}';

export async function classifyInboxWithOpenAI(opts: {
  filename: string;
  mimeType: string;
  /** Texto extraido do PDF (quando disponivel) — usado como evidencia real. */
  textExcerpt?: string;
  /** Bytes da imagem (jpg/png/webp) em base64 — enviados como visao real. */
  imageBase64?: string;
  apiKey?: string;
}): Promise<ClassifyResult> {
  const apiKey = opts.apiKey?.trim() || requireEnv("OPENAI_API_KEY");
  const model = process.env.OPENAI_MODEL?.trim() || "gpt-4.1";

  // Sem conteudo real (nem texto extraido, nem imagem), a classificacao seria
  // um mero chute pelo nome do arquivo — melhor falhar de forma explicita do
  // que fingir que a IA "leu" o documento.
  if (!opts.textExcerpt?.trim() && !opts.imageBase64) {
    throw new Error(
      "Não foi possível extrair conteúdo do arquivo para classificação (nem texto, nem imagem). Envie um PDF com texto ou uma foto legível.",
    );
  }

  const userContent: Array<
    | { type: "text"; text: string }
    | { type: "image_url"; image_url: { url: string } }
  > = [
    {
      type: "text",
      text: [
        CLASSIFY_PROMPT,
        `Arquivo: ${opts.filename}`,
        `MIME: ${opts.mimeType}`,
        opts.textExcerpt ? `Texto extraído do documento:\n${opts.textExcerpt.slice(0, 4000)}` : "",
      ]
        .filter(Boolean)
        .join("\n"),
    },
  ];

  if (opts.imageBase64) {
    userContent.push({
      type: "image_url",
      image_url: { url: `data:${opts.mimeType};base64,${opts.imageBase64}` },
    });
  }

  const res = await fetchWithTimeout("https://api.openai.com/v1/chat/completions", {
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
            "Você classifica documentos para um escritório de contabilidade brasileiro com base no CONTEÚDO real fornecido (texto ou imagem) — nunca invente com base só no nome do arquivo.",
        },
        { role: "user", content: userContent },
      ],
    }),
  }, 45_000);

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
