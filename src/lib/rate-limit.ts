/**
 * Rate limit em memoria, por processo. Suficiente para conter abuso e custo
 * descontrolado de API paga (OpenAI) num deploy single-instance.
 *
 * LIMITACAO: em multiplas instancias/serverless cada processo tem seu proprio
 * contador (limite efetivo = limit x N_instancias) e cold starts zeram. Para
 * protecao distribuida forte (ex.: brute-force em login em escala), use um
 * store compartilhado (Redis). Aqui e uma barreira best-effort.
 */
type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

// Varredura periodica para nao acumular buckets de keys que aparecem uma vez
// e nunca mais (ex.: IPs/emails rotativos em brute-force) — evita memory leak.
const SWEEP_INTERVAL_MS = 5 * 60_000;
const MAX_BUCKETS = 50_000;

function sweep() {
  const now = Date.now();
  for (const [key, b] of buckets) {
    if (b.resetAt <= now) buckets.delete(key);
  }
}

// timer nao segura o processo vivo (unref) e nao duplica em hot-reload.
const globalForRl = globalThis as unknown as { __rlSweeper?: NodeJS.Timeout };
if (!globalForRl.__rlSweeper) {
  const t = setInterval(sweep, SWEEP_INTERVAL_MS);
  if (typeof t.unref === "function") t.unref();
  globalForRl.__rlSweeper = t;
}

export function checkRateLimit(
  key: string,
  opts: { limit: number; windowMs: number },
): { allowed: boolean; retryAfterMs: number } {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    // Teto duro de seguranca: se o Map explodir (ataque com keys unicas),
    // faz uma varredura imediata antes de inserir.
    if (buckets.size > MAX_BUCKETS) sweep();
    buckets.set(key, { count: 1, resetAt: now + opts.windowMs });
    return { allowed: true, retryAfterMs: 0 };
  }

  if (bucket.count >= opts.limit) {
    return { allowed: false, retryAfterMs: bucket.resetAt - now };
  }

  bucket.count += 1;
  return { allowed: true, retryAfterMs: 0 };
}
