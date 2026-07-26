import { lookup as dnsLookup } from "dns";
import { lookup as dnsLookupAsync } from "dns/promises";
import net from "net";
import { Agent } from "undici";

/**
 * Defesa contra SSRF para requisicoes de saida com baseUrl configuravel pelo
 * usuario (integracoes Dominio/ClickSign/ProContador).
 *
 * A validacao acontece em DOIS pontos:
 *  1. assertPublicHttpsUrl(): valida o esquema e faz uma checagem previa (UX/erro claro).
 *  2. ssrfSafeDispatcher: um Agent undici cujo `connect.lookup` valida o IP
 *     REAL no momento da conexao TCP — isso fecha TOCTOU/DNS rebinding e
 *     revalida CADA salto de redirect (o fetch segue redirects reabrindo a
 *     conexao, que passa de novo pelo lookup).
 */

function normalizeMappedIp(ip: string): string {
  const v = ip.toLowerCase();
  // IPv4-mapeado-em-IPv6: ::ffff:169.254.169.254  ou  ::ffff:a9fe:a9fe
  if (v.startsWith("::ffff:")) {
    const rest = v.slice(7);
    if (net.isIP(rest) === 4) return rest;
    // forma hex ::ffff:a9fe:a9fe -> converte os 2 ultimos grupos para IPv4
    const m = rest.match(/^([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
    if (m) {
      const hi = parseInt(m[1], 16);
      const lo = parseInt(m[2], 16);
      return `${(hi >> 8) & 0xff}.${hi & 0xff}.${(lo >> 8) & 0xff}.${lo & 0xff}`;
    }
  }
  return ip;
}

export function isPrivateIp(rawIp: string): boolean {
  const ip = normalizeMappedIp(rawIp);
  const type = net.isIP(ip);

  if (type === 4) {
    const [a, b] = ip.split(".").map(Number);
    if (a === 0) return true; // "this" network / unspecified
    if (a === 10) return true; // 10.0.0.0/8
    if (a === 127) return true; // loopback
    if (a === 169 && b === 254) return true; // link-local / metadata cloud
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
    if (a === 192 && b === 168) return true; // 192.168.0.0/16
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT 100.64.0.0/10
    if (a === 192 && b === 0) return true; // 192.0.0.0/24 (IANA special)
    if (a >= 224) return true; // multicast/reservado 224.0.0.0+
    return false;
  }

  if (type === 6) {
    const v = ip.toLowerCase();
    if (v === "::" || v === "::1") return true; // unspecified / loopback
    if (v.startsWith("fe80:")) return true; // link-local
    if (v.startsWith("fc") || v.startsWith("fd")) return true; // ULA fc00::/7
    if (v.startsWith("ff")) return true; // multicast
    if (v.startsWith("64:ff9b:")) return true; // NAT64 (pode alcançar IPv4 interno)
    if (v.startsWith("2002:")) return true; // 6to4 (pode encapsular IPv4 interno)
    return false;
  }

  // Nao e um IP valido -> trata como inseguro
  return true;
}

export class SsrfBlockedError extends Error {
  constructor(target: string) {
    super(`Alvo bloqueado: endereco interno/privado ou invalido (${target})`);
    this.name = "SsrfBlockedError";
  }
}

/**
 * Checagem previa da URL (esquema https + host que nao resolve para IP
 * interno). Nao substitui o dispatcher — e a primeira barreira, com mensagem
 * de erro clara para o usuario.
 */
export async function assertPublicHttpsUrl(rawUrl: string): Promise<void> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new SsrfBlockedError(rawUrl);
  }

  if (url.protocol !== "https:") throw new SsrfBlockedError(rawUrl);

  const hostname = url.hostname.toLowerCase();
  if (hostname === "localhost" || hostname.endsWith(".localhost")) {
    throw new SsrfBlockedError(rawUrl);
  }

  if (net.isIP(hostname)) {
    if (isPrivateIp(hostname)) throw new SsrfBlockedError(rawUrl);
    return;
  }

  let addresses: { address: string }[];
  try {
    addresses = await dnsLookupAsync(hostname, { all: true });
  } catch {
    throw new SsrfBlockedError(rawUrl);
  }
  if (addresses.length === 0 || addresses.some((a) => isPrivateIp(a.address))) {
    throw new SsrfBlockedError(rawUrl);
  }
}

/**
 * Dispatcher que valida o IP no momento da conexao real (fecha TOCTOU e
 * revalida cada redirect). Use em `fetch(url, { dispatcher: ssrfSafeDispatcher() })`.
 * maxRedirections limitado — cada redirect reabre conexao e re-valida o IP.
 */
export function ssrfSafeDispatcher(): Agent {
  return new Agent({
    connect: {
      lookup: (hostname, options, callback) => {
        dnsLookup(hostname, options, (err, address, family) => {
          if (err) return callback(err, address as string, family as number);
          const addrs = Array.isArray(address)
            ? (address as unknown as { address: string }[])
            : [{ address: address as string }];
          for (const a of addrs) {
            if (isPrivateIp(a.address)) {
              return callback(
                new SsrfBlockedError(a.address),
                address as string,
                family as number,
              );
            }
          }
          callback(err, address as string, family as number);
        });
      },
    },
  });
}
