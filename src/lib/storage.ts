import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";

/**
 * Armazenamento de arquivos persistentes (comprovantes, guias assinadas, XMLs
 * capturados, uploads do Inbox).
 *
 * Por que existe: no Railway o filesystem do container é efêmero. Todo
 * `writeFile` em `data/` desaparecia no redeploy seguinte, levando embora
 * comprovante de pagamento — que é prova fiscal, não cache. Agora os bytes vão
 * para o Supabase Storage num bucket PRIVADO, e o banco guarda só a chave.
 *
 * ## O contrato do "pointer"
 *
 * As colunas do Prisma que antes guardavam caminho absoluto (`Payment.proofPath`,
 * `Contract.signedPdfPath`, `XmlDocument.rawPath`, `InboxItem.filePath`) passam a
 * guardar um *pointer*, que é uma de duas coisas:
 *
 *   - **chave do bucket** — relativa, sem barra inicial: `proofs/<firmId>/<id>.pdf`
 *   - **caminho local absoluto** — `/app/data/proofs/...` ou `C:\...`
 *
 * `readStoredFile` distingue os dois por formato. Isso resolve dois problemas de
 * uma vez: o dev sem Supabase configurado continua funcionando em disco, e as
 * linhas antigas gravadas antes desta mudança continuam legíveis sem migração de
 * dados. Nenhuma linha existente precisa ser reescrita.
 */

const BUCKET = process.env.SUPABASE_STORAGE_BUCKET?.trim() || "hub-files";
const LOCAL_ROOT = path.join(process.cwd(), "data");
const REQUEST_TIMEOUT_MS = 30_000;

function supabaseConfig() {
  const url = process.env.SUPABASE_URL?.trim().replace(/\/+$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) return null;
  return { url, key };
}

/** true quando SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY estão presentes. */
export function isRemoteStorageConfigured(): boolean {
  return supabaseConfig() !== null;
}

/**
 * Um pointer é caminho local se começa com `/` (POSIX) ou `C:\` (Windows).
 * Chaves de bucket são sempre relativas — garantido por `normalizeKey`.
 */
export function isLocalPointer(pointer: string): boolean {
  return /^([a-zA-Z]:[\\/]|[\\/])/.test(pointer);
}

/**
 * Sanitiza cada segmento da chave. Barra inicial, `..` e caracteres fora do
 * conjunto seguro do S3 são removidos — um `firmId` ou nome de arquivo vindo do
 * cliente não deve poder escapar do prefixo nem virar caminho absoluto.
 */
function normalizeKey(segments: string[]): string {
  const clean = segments
    .flatMap((s) => String(s).split("/"))
    .map((s) => s.replace(/[^a-zA-Z0-9._-]/g, "_"))
    .filter((s) => s.length > 0 && s !== "." && s !== "..");
  if (clean.length === 0) throw new Error("storage: chave vazia");
  return clean.join("/");
}

export function storageKey(...segments: string[]): string {
  return normalizeKey(segments);
}

function authHeaders(key: string): Record<string, string> {
  return { Authorization: `Bearer ${key}`, apikey: key };
}

function objectUrl(baseUrl: string, key: string): string {
  const encoded = key.split("/").map(encodeURIComponent).join("/");
  return `${baseUrl}/storage/v1/object/${encodeURIComponent(BUCKET)}/${encoded}`;
}

async function errorDetail(res: Response): Promise<string> {
  const body = await res.text().catch(() => "");
  return `${res.status} ${res.statusText}${body ? ` — ${body.slice(0, 300)}` : ""}`;
}

/**
 * Grava os bytes e devolve o pointer para persistir no banco.
 *
 * Com Supabase configurado, sobe para o bucket e devolve a chave. Sem
 * configuração, cai para `data/<key>` em disco e devolve o caminho absoluto —
 * é o modo de desenvolvimento local, não deve ser o de produção.
 */
export async function writeStoredFile(opts: {
  key: string;
  body: Buffer | string;
  contentType: string;
}): Promise<string> {
  const key = normalizeKey([opts.key]);
  const buffer =
    typeof opts.body === "string" ? Buffer.from(opts.body, "utf8") : opts.body;
  const config = supabaseConfig();

  if (!config) {
    const filePath = path.join(LOCAL_ROOT, key);
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, buffer);
    return filePath;
  }

  const res = await fetch(objectUrl(config.url, key), {
    method: "POST",
    headers: {
      ...authHeaders(config.key),
      "Content-Type": opts.contentType,
      // Reenvio do mesmo comprovante sobrescreve em vez de estourar 409.
      "x-upsert": "true",
    },
    body: new Uint8Array(buffer),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!res.ok) {
    throw new Error(
      `Falha ao gravar no Supabase Storage (${key}): ${await errorDetail(res)}`,
    );
  }
  return key;
}

/**
 * Lê os bytes a partir do pointer gravado no banco, seja chave de bucket ou
 * caminho local legado.
 *
 * Lança se o objeto não existe — quem chama decide se isso é 404 para o usuário.
 */
export async function readStoredFile(pointer: string): Promise<Buffer> {
  if (!pointer) throw new Error("storage: pointer vazio");

  if (isLocalPointer(pointer)) {
    return readFile(pointer);
  }

  const config = supabaseConfig();
  if (!config) {
    // Pointer relativo sem Supabase configurado: foi gravado em modo local.
    return readFile(path.join(LOCAL_ROOT, pointer));
  }

  const res = await fetch(objectUrl(config.url, pointer), {
    headers: authHeaders(config.key),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!res.ok) {
    throw new Error(
      `Falha ao ler do Supabase Storage (${pointer}): ${await errorDetail(res)}`,
    );
  }
  return Buffer.from(await res.arrayBuffer());
}

const CONTENT_TYPES: Record<string, string> = {
  pdf: "application/pdf",
  png: "image/png",
  webp: "image/webp",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  xml: "application/xml",
  txt: "text/plain; charset=utf-8",
};

/** Content-Type a partir da extensão, para servir o arquivo de volta. */
export function contentTypeForPointer(pointer: string): string {
  const ext = pointer.split(".").pop()?.toLowerCase() ?? "";
  return CONTENT_TYPES[ext] ?? "application/octet-stream";
}
