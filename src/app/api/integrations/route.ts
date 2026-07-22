import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { readSession } from "@/lib/auth";
import {
  INTEGRATION_PROVIDERS,
  decodeCreds,
  encodeCreds,
  testIntegration,
  type IntegrationProvider,
} from "@/lib/integrations";

export async function GET() {
  const session = await readSession();
  if (!session || session.role === "CLIENT") {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const existing = await prisma.integration.findMany({
    where: { firmId: session.firmId },
  });
  const byProvider = new Map(existing.map((i) => [i.provider, i]));

  const catalog = INTEGRATION_PROVIDERS.map((provider) => {
    const row = byProvider.get(provider);
    return {
      provider,
      status: row?.status ?? "DISCONNECTED",
      lastSyncAt: row?.lastSyncAt ?? null,
      lastError: row?.lastError ?? null,
      hasCredentials: Boolean(row?.credentialsEnc),
    };
  });

  return NextResponse.json({ integrations: catalog });
}

const connectSchema = z.object({
  provider: z.enum(["DOMINIO", "OMIE", "CLICKSIGN", "OPENAI"]),
  credentials: z.record(z.string()),
  test: z.boolean().default(true),
});

export async function POST(req: Request) {
  const session = await readSession();
  if (!session || session.role === "CLIENT") {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const json = await req.json().catch(() => null);
  const parsed = connectSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });
  }

  const provider = parsed.data.provider as IntegrationProvider;
  let status = "CONNECTED";
  let lastError: string | null = null;

  if (parsed.data.test) {
    const result = await testIntegration(provider, parsed.data.credentials);
    if (!result.ok) {
      status = "ERROR";
      lastError = result.detail;
    }
  }

  const integration = await prisma.integration.upsert({
    where: {
      firmId_provider: { firmId: session.firmId, provider },
    },
    create: {
      firmId: session.firmId,
      provider,
      status,
      credentialsEnc: encodeCreds(parsed.data.credentials),
      lastError,
      lastSyncAt: status === "CONNECTED" ? new Date() : null,
    },
    update: {
      status,
      credentialsEnc: encodeCreds(parsed.data.credentials),
      lastError,
      lastSyncAt: status === "CONNECTED" ? new Date() : null,
    },
  });

  if (provider === "OPENAI" && parsed.data.credentials.apiKey) {
    // Persist also readable via env-less path for classify if set on Integration —
    // classify still uses OPENAI_API_KEY env; mirror tip in response.
  }

  return NextResponse.json({
    integration: {
      provider: integration.provider,
      status: integration.status,
      lastError: integration.lastError,
      hasCredentials: true,
    },
    hint:
      provider === "OPENAI"
        ? "Para o inbox, defina também OPENAI_API_KEY nas variáveis do Railway/.env"
        : undefined,
    decodedKeys: Object.keys(decodeCreds(integration.credentialsEnc)),
  });
}
