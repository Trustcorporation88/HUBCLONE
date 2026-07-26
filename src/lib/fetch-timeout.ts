/**
 * fetch com timeout via AbortController. APIs externas (Omie, ProContador,
 * ClickSign, Dominio) sem timeout podem pendurar a request do usuario
 * indefinidamente se o parceiro nao responder.
 */
export async function fetchWithTimeout(
  input: string,
  init: RequestInit = {},
  timeoutMs = 15_000,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
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
