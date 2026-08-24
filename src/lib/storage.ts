/**
 * Persistent object storage backed by Supabase Storage (PRO).
 *
 * Replaces the ephemeral local filesystem (`process.cwd()/data`) used before,
 * which lost data on every serverless/container redeploy. All user files
 * (payment proofs, tax guides, captured XMLs) live in a private Supabase
 * bucket and are addressed by an object *key* (e.g. `proofs/<firm>/<id>.pdf`)
 * that is stored in the database instead of an absolute disk path.
 *
 * Uses the Storage REST API with the service-role key (server-only) — no extra
 * npm dependency required. Never import this module in a Client Component.
 */
import { requireEnv } from "@/lib/runtime";

const DEFAULT_TIMEOUT_MS = 20000;

function config() {
  const url = requireEnv("SUPABASE_URL").replace(/\/$/, "");
  const serviceKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const bucket = process.env.SUPABASE_STORAGE_BUCKET?.trim() || "hub-files";
  return { url, serviceKey, bucket };
}

/** True when Supabase Storage is configured (used for graceful degradation). */
export function isStorageConfigured() {
  return Boolean(
    process.env.SUPABASE_URL?.trim() &&
      process.env.SUPABASE_SERVICE_ROLE_KEY?.trim(),
  );
}

/**
 * A stored value is a Supabase object key when it is a relative path.
 * Legacy values are absolute local paths (Windows drive or POSIX root).
 */
export function isStorageKey(value: string): boolean {
  if (!value) return false;
  if (/^[a-zA-Z]:[\\/]/.test(value)) return false; // C:\...
  if (value.startsWith("/") || value.startsWith("\\")) return false;
  return true;
}

function encodeKey(key: string): string {
  return key
    .split("/")
    .map((p) => encodeURIComponent(p))
    .join("/");
}

/** Upload (or overwrite) an object. Returns the object key to persist. */
export async function putObject(
  key: string,
  body: Buffer | string,
  contentType = "application/octet-stream",
): Promise<string> {
  const { url, serviceKey, bucket } = config();
  const buf = typeof body === "string" ? Buffer.from(body, "utf8") : body;
  // Copy into a plain Uint8Array so it is a valid BodyInit for fetch.
  const data = new Uint8Array(buf);
  const res = await fetch(`${url}/storage/v1/object/${bucket}/${encodeKey(key)}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": contentType,
      "x-upsert": "true",
      "cache-control": "3600",
    },
    body: data,
    signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(
      `Falha ao gravar no storage (${res.status}): ${detail.slice(0, 200)}`,
    );
  }
  return key;
}

/** Download an object as a Buffer. */
export async function getObject(key: string): Promise<Buffer> {
  const { url, serviceKey, bucket } = config();
  const res = await fetch(`${url}/storage/v1/object/${bucket}/${encodeKey(key)}`, {
    method: "GET",
    headers: { Authorization: `Bearer ${serviceKey}` },
    signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(
      `Falha ao ler do storage (${res.status}): ${detail.slice(0, 200)}`,
    );
  }
  const arr = await res.arrayBuffer();
  return Buffer.from(arr);
}

/** Best-effort delete; ignores missing objects. */
export async function removeObject(key: string): Promise<void> {
  const { url, serviceKey, bucket } = config();
  await fetch(`${url}/storage/v1/object/${bucket}/${encodeKey(key)}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${serviceKey}` },
    signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
  }).catch(() => undefined);
}
