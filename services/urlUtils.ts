/**
 * Shared URL validation helpers used by both the client and server code.
 *
 * NOTE: This logic is duplicated in server/src/services/urlUtils.ts (rather
 * than imported across the package boundary) because the server's tsconfig
 * `rootDir` is `./src` — importing the root-level file would fail
 * `tsc --noEmit` with a "not under rootDir" error. Keep the two copies in sync
 * if this logic ever changes.
 */

/** True only for well-formed http(s) URLs. */
export function isHttpUrl(url?: string | null): boolean {
  if (!url) return false;
  try {
    const u = new URL(url.trim());
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}
