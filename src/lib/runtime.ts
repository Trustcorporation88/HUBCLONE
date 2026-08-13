/**
 * Runtime policy: zero mock/demo in production paths.
 * Missing credentials = hard fail (never invent SEFAZ/PIX/e-mail).
 */

export function isDemoAllowed() {
  return process.env.ALLOW_DEMO === "true";
}

/**
 * Quem fala com a SEFAZ: "saas" (ProContador, padrao) ou "local" (motor antigo
 * deste app). Existe um dono so porque dois sistemas consultando o mesmo
 * DistDFe com o mesmo CNPJ se bloqueiam por consumo indevido e podem consumir o
 * cursor NSU um do outro.
 */
export function captureOwner(): "saas" | "local" {
  return process.env.CAPTURE_OWNER?.trim().toLowerCase() === "local"
    ? "local"
    : "saas";
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
    // Hosts oficiais do ADN (adn.nfse.gov.br/contribuintes em produção) já
    // são o default no código — a variável só existe para sobrescrever em
    // casos especiais, não é mais obrigatória para a captura de NFS-e.
    ok: true,
    detail: process.env.NFSE_ADN_BASE_URL?.trim()
      ? `sobrescrito: ${process.env.NFSE_ADN_BASE_URL.trim()}`
      : "ok (default: adn.nfse.gov.br/contribuintes)",
  });

  // A chave dedicada dos certificados e critica: sem ela, o A1 dos clientes fica
  // cifrado com o mesmo segredo da sessao, e rotacionar AUTH_SECRET depois de um
  // incidente torna todos os certificados ilegiveis.
  // Checagem inline em vez de importar de crypto-secret: aquele modulo importa
  // requireAuthSecret daqui, e o import mutuo entre os dois quebra em runtime.
  const certKey = process.env.CERT_ENCRYPTION_KEY?.trim();
  checks.push({
    key: "CERT_ENCRYPTION_KEY",
    ok: Boolean(certKey && certKey.length >= 32),
    detail: !certKey
      ? "ausente — os certificados A1 usam o mesmo segredo da sessao; rotacionar AUTH_SECRET os torna ilegiveis"
      : certKey.length < 32
        ? "curta demais (minimo 32 caracteres aleatorios)"
        : "ok (chave dedicada)",
  });

  checks.push({
    key: "CAPTURE_OWNER",
    ok: true,
    detail:
      captureOwner() === "local"
        ? "local — este app fala direto com a SEFAZ (nao use junto com o ProContador no mesmo CNPJ)"
        : "saas — captura e certificado A1 no ProContador (recomendado)",
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
    ["AUTH_SECRET", "DATABASE_URL", "SMTP", "CERT_ENCRYPTION_KEY"].includes(c.key),
  );
  const ok = critical.every((c) => c.ok);

  return { ok, demoAllowed, checks };
}
