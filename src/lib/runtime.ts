/**
 * Runtime policy: zero mock/demo in production paths.
 * Missing credentials = hard fail (never invent SEFAZ/PIX/e-mail).
 */

export function isDemoAllowed() {
  return process.env.ALLOW_DEMO === "true";
}

export function requireEnv(name: string): string {
  const v = process.env[name]?.trim();
  if (!v) {
    throw new Error(
      `Configuração obrigatória ausente: ${name}. Preencha o .env — operação mock/demo desabilitada.`,
    );
  }
  return v;
}

export function requireAuthSecret() {
  const secret = process.env.AUTH_SECRET?.trim();
  if (!secret || secret.includes("change-me") || secret.includes("hub-dev")) {
    throw new Error(
      "AUTH_SECRET inválido. Defina um segredo forte no .env (não use valor de exemplo).",
    );
  }
  return secret;
}

export type OpsStatus = {
  ok: boolean;
  demoAllowed: boolean;
  checks: Array<{ key: string; ok: boolean; detail: string }>;
};

export function getOpsStatus(): OpsStatus {
  const checks: OpsStatus["checks"] = [];
  const demoAllowed = isDemoAllowed();

  const auth = process.env.AUTH_SECRET?.trim();
  checks.push({
    key: "AUTH_SECRET",
    ok: Boolean(auth && !auth.includes("change-me") && !auth.includes("hub-dev")),
    detail: auth
      ? auth.includes("change-me") || auth.includes("hub-dev")
        ? "ainda é valor de exemplo"
        : "ok"
      : "ausente",
  });

  checks.push({
    key: "SMTP",
    ok: Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS && process.env.SMTP_FROM),
    detail:
      process.env.SMTP_HOST && process.env.SMTP_FROM
        ? "host/from presentes"
        : "SMTP_HOST, SMTP_USER, SMTP_PASS, SMTP_FROM obrigatórios para e-mail",
  });

  checks.push({
    key: "NFSE_ADN_BASE_URL",
    ok: Boolean(process.env.NFSE_ADN_BASE_URL),
    detail: process.env.NFSE_ADN_BASE_URL
      ? "ok"
      : "obrigatório para captura NFS-e ao vivo",
  });

  checks.push({
    key: "DATABASE_URL",
    ok: Boolean(process.env.DATABASE_URL),
    detail: process.env.DATABASE_URL ? "ok" : "ausente",
  });

  checks.push({
    key: "OPENAI_API_KEY",
    ok: Boolean(process.env.OPENAI_API_KEY?.trim()),
    detail: process.env.OPENAI_API_KEY?.trim()
      ? "ok (inbox IA)"
      : "ausente — inbox com IA falhará até configurar",
  });

  const critical = checks.filter((c) =>
    ["AUTH_SECRET", "DATABASE_URL", "SMTP"].includes(c.key),
  );
  const ok = critical.every((c) => c.ok);

  return { ok, demoAllowed, checks };
}
