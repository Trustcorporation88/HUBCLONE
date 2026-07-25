import { lookup } from "dns/promises";
import net from "net";

/**
 * Bloqueia requisicoes de saida (SSRF) para enderecos privados/internos.
 * Usado em qualquer lugar que aceite uma baseUrl configuravel pelo usuario
 * (integracoes Dominio/ClickSign/ProContador) antes de fazer fetch() com ela.
 */
function isPrivateIp(ip: string): boolean {
  const type = net.isIP(ip);
  if (type === 4) {
    const parts = ip.split(".").map(Number);
    const [a, b] = parts;
    if (a === 127) return true; // loopback
    if (a === 10) return true; // 10.0.0.0/8
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
    if (a === 192 && b === 168) return true; // 192.168.0.0/16
    if (a === 169 && b === 254) return true; // link-local / metadata cloud
    if (a === 0) return true;
    return false;
  }
  if (type === 6) {
    const v = ip.toLowerCase();
    if (v === "::1") return true; // loopback
    if (v.startsWith("fe80:")) return true; // link-local
    if (v.startsWith("fc") || v.startsWith("fd")) return true; // unique local (fc00::/7)
    return false;
  }
  return false;
}

export class SsrfBlockedError extends Error {
  constructor(url: string) {
    super(`URL bloqueada: aponta para um endereco interno/privado (${url})`);
    this.name = "SsrfBlockedError";
  }
}

/**
 * Valida que a URL usa https:// e que o host nao resolve para um endereco
 * privado/loopback/link-local (incluindo o endpoint de metadata da nuvem
 * 169.254.169.254). Lanca SsrfBlockedError se a URL for insegura.
 */
export async function assertPublicHttpsUrl(rawUrl: string): Promise<void> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new SsrfBlockedError(rawUrl);
  }

  if (url.protocol !== "https:") {
    throw new SsrfBlockedError(rawUrl);
  }

  const hostname = url.hostname.toLowerCase();
  if (hostname === "localhost" || hostname.endsWith(".localhost")) {
    throw new SsrfBlockedError(rawUrl);
  }

  // Se o host ja e um literal de IP, valida direto sem DNS.
  if (net.isIP(hostname)) {
    if (isPrivateIp(hostname)) throw new SsrfBlockedError(rawUrl);
    return;
  }

  let addresses: { address: string }[];
  try {
    addresses = await lookup(hostname, { all: true });
  } catch {
    throw new SsrfBlockedError(rawUrl);
  }

  if (addresses.length === 0 || addresses.some((a) => isPrivateIp(a.address))) {
    throw new SsrfBlockedError(rawUrl);
  }
}
