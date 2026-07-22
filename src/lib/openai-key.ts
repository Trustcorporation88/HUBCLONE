import { prisma } from "@/lib/db";
import { decodeCreds } from "@/lib/integrations";

/** Env primeiro; senão chave salva em Integrações → OpenAI. */
export async function resolveOpenAiKey(firmId: string): Promise<string> {
  const envKey = process.env.OPENAI_API_KEY?.trim();
  if (envKey) return envKey;

  const row = await prisma.integration.findUnique({
    where: { firmId_provider: { firmId, provider: "OPENAI" } },
  });
  const fromIntegration = decodeCreds(row?.credentialsEnc).apiKey?.trim();
  if (fromIntegration) return fromIntegration;

  throw new Error(
    "OPENAI_API_KEY ausente. Configure no Railway/.env ou em Integrações → OpenAI.",
  );
}

export function openAiModel() {
  return process.env.OPENAI_MODEL?.trim() || "gpt-4.1";
}
