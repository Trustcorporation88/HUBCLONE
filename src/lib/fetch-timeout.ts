import type { Dispatcher } from "undici";

/**
 * fetch com timeout via AbortController. APIs externas (Omie, ProContador,
 * ClickSign, Dominio, OpenAI) sem timeout podem pendurar a request do usuario
 * indefinidamente se o parceiro nao responder.
 *
 * Aceita um `dispatcher` opcional (undici) — usado para injetar o
 * ssrfSafeDispatcher em chamadas com baseUrl configuravel pelo usuario, que
 * valida o IP real na conexao e revalida cada redirect.
 */
export async function fetchWithTimeout(
  input: string,
  init: RequestInit = {},
  timeoutMs = 15_000,
  dispatcher?: Dispatcher,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const opts: RequestInit & { dispatcher?: Dispatcher } = {
      ...init,
      signal: controller.signal,
    };
    if (dispatcher) opts.dispatcher = dispatcher;
    return await fetch(input, opts as RequestInit);
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") {
      throw new Error(
        `Tempo esgotado ao contatar servico externo (${timeoutMs / 1000}s).`,
      );
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}
