import path from "path";

/** Absolute base directory where the app persists user files. */
export const DATA_ROOT = path.join(process.cwd(), "data");

/**
 * Ensures `target` resolves to a path inside `DATA_ROOT` (or `baseDir`).
 * Prevents path traversal / arbitrary file reads from DB-sourced paths.
 * Returns the resolved absolute path, or null if it escapes the base.
 */
export function resolveInside(
  target: string,
  baseDir: string = DATA_ROOT,
): string | null {
  const base = path.resolve(baseDir);
  const resolved = path.resolve(target);
  const rel = path.relative(base, resolved);
  if (rel === "" || rel.startsWith("..") || path.isAbsolute(rel)) {
    return null;
  }
  return resolved;
}
