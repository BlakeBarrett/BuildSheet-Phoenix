/**
 * Canonical environment helpers.
 *
 * The server historically read `process.env.NODE_ENV` directly, but the repo's
 * `.env` ships `SERVER_NODE_ENV=development` (a value nothing read). Resolve a
 * single canonical env so a mis-set variable can never silently downgrade
 * security posture (e.g. disabling auth in production).
 */
function canonicalEnv(): string {
  return process.env.NODE_ENV || process.env.SERVER_NODE_ENV || 'development';
}

export function isProduction(): boolean {
  return canonicalEnv() === 'production';
}

export function isDev(): boolean {
  return !isProduction();
}
