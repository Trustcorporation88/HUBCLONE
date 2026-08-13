import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  scryptSync,
} from "crypto";
import { requireAuthSecret } from "@/lib/runtime";

/**
 * Cifra em repouso de material sensível: .pfx do A1, senha do certificado e
 * credenciais de integração.
 *
 * POR QUE UMA CHAVE DEDICADA
 *
 * Antes, a chave AES era `sha256(AUTH_SECRET)` — o mesmo segredo que assina o
 * JWT de sessão. Isso criava dois problemas graves:
 *
 *  1. Vazar o segredo de sessão passava a significar vazar a CHAVE PRIVADA de
 *     assinatura de todos os clientes do escritório, com a senha junto.
 *  2. Rotacionar o AUTH_SECRET (procedimento normal depois de um incidente)
 *     tornava TODOS os certificados indecifráveis, sem caminho de volta a não
 *     ser pedir o .pfx de novo para cada cliente.
 *
 * Agora existe CERT_ENCRYPTION_KEY, independente do AUTH_SECRET, e o payload
 * carrega versão de chave para permitir rotação sem perder o que já está
 * gravado.
 *
 * FORMATO
 *
 *   v2.<base64(iv|tag|ciphertext)>   chave atual (CERT_ENCRYPTION_KEY, scrypt)
 *   <base64(iv|tag|ciphertext)>      legado v1 (sha256(AUTH_SECRET))
 *
 * A leitura aceita os dois. A escrita sempre usa v2. Para converter o acervo
 * antigo, rode `npm run certs:rekey` (scripts/rekey-certificates.ts).
 */

const V2_PREFIX = "v2.";

/** Separação de domínio: a mesma senha nunca deriva a mesma chave em usos diferentes. */
const KDF_SALT = Buffer.from("procontador-os/cert-encryption/v2", "utf8");

let cachedV2Key: Buffer | null = null;

/**
 * scrypt em vez de sha256 puro: se o segredo configurado não for aleatório de
 * verdade, sha256 permite força bruta offline barata. O custo é pago uma vez
 * por processo, não por operação.
 */
function v2Key(): Buffer {
  if (cachedV2Key) return cachedV2Key;
  const secret = process.env.CERT_ENCRYPTION_KEY?.trim();
  if (!secret || secret.length < 32) {
    throw new Error(
      "CERT_ENCRYPTION_KEY ausente ou curta demais (mínimo 32 caracteres). " +
        "Gere um valor aleatório forte e configure no ambiente — ela protege as " +
        "chaves privadas A1 dos clientes e NÃO deve ser igual ao AUTH_SECRET.",
    );
  }
  if (secret === process.env.AUTH_SECRET?.trim()) {
    throw new Error(
      "CERT_ENCRYPTION_KEY não pode ser igual ao AUTH_SECRET — o objetivo é " +
        "justamente que vazar a sessão não vaze os certificados.",
    );
  }
  cachedV2Key = scryptSync(secret, KDF_SALT, 32);
  return cachedV2Key;
}

/** Chave do formato antigo. Só para LER o que já está gravado. */
function legacyKey(): Buffer {
  return createHash("sha256").update(requireAuthSecret()).digest();
}

function seal(plain: string, key: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString("base64");
}

function open(payload: string, key: Buffer): string {
  const buf = Buffer.from(payload, "base64");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const data = buf.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString(
    "utf8",
  );
}

export function encryptSecret(plain: string): string {
  return V2_PREFIX + seal(plain, v2Key());
}

export function decryptSecret(payload: string): string {
  if (payload.startsWith(V2_PREFIX)) {
    return open(payload.slice(V2_PREFIX.length), v2Key());
  }
  // Registro anterior à chave dedicada. Continua legível até o rekey.
  return open(payload, legacyKey());
}

/** True quando o registro ainda está na chave antiga (usado pelo rekey). */
export function isLegacyPayload(payload: string): boolean {
  return !payload.startsWith(V2_PREFIX);
}

/** Cifra binário (ex.: .pfx) — AES-256-GCM sobre o base64 do conteúdo. */
export function encryptBytes(data: Buffer): string {
  return encryptSecret(data.toString("base64"));
}

export function decryptBytes(payload: string): Buffer {
  return Buffer.from(decryptSecret(payload), "base64");
}

export function onlyDigits(value: string) {
  return value.replace(/\D/g, "");
}
