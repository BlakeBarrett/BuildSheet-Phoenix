/**
 * Shared URL validation helpers used by both the client and server code.
 *
 * Keep this dependency-free (no node:net, no undici) so it can be imported
 * into browser bundles and server tests without polyfills.
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
