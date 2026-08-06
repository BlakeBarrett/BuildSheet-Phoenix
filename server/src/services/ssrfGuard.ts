/**
 * SSRF guard — validates that a URL is safe for the server to fetch on behalf
 * of a user. Blocks private/loopback/link-local/reserved addresses, cloud
 * metadata endpoints, and local-only hostnames.
 */
import { isIP } from 'node:net';
import { lookup } from 'node:dns/promises';

/** IPv4 private/reserved blocks as [base, prefix] pairs. */
const PRIVATE_V4: Array<[number, number]> = [
  [0x00000000, 8],   // 0.0.0.0/8
  [0x0a000000, 8],   // 10.0.0.0/8
  [0x64400000, 10],  // 100.64.0.0/10 (CGNAT)
  [0x7f000000, 8],   // 127.0.0.0/8
  [0xa9fe0000, 16],  // 169.254.0.0/16 (link-local, incl. 169.254.169.254)
  [0xac100000, 12],  // 172.16.0.0/12
  [0xc0000000, 24],  // 192.0.0.0/24
  [0xc0000200, 24],  // 192.0.2.0/24 (TEST-NET-1)
  [0xc0a80000, 16],  // 192.168.0.0/16
  [0xc6120000, 15],  // 198.18.0.0/15 (benchmark)
  [0xc6336400, 24],  // 198.51.100.0/24 (TEST-NET-2)
  [0xcb007100, 24],  // 203.0.113.0/24 (TEST-NET-3)
  [0xe0000000, 4],   // 224.0.0.0/4 (multicast)
  [0xf0000000, 4],   // 240.0.0.0/4 (reserved)
];

/** IPv6 private/reserved networks as [baseBigInt, prefix]. */
const PRIVATE_V6: Array<[bigint, number]> = [
  [0x00000000000000000000000000000000n, 128], // ::
  [0x00000000000000000000000000000001n, 128], // ::1
  [0xfc000000000000000000000000000000n, 7],   // fc00::/7 (ULA)
  [0xfe800000000000000000000000000000n, 10],  // fe80::/10 (link-local)
  [0xff000000000000000000000000000000n, 8],   // ff00::/8 (multicast)
];

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some(p => Number.isNaN(p) || p < 0 || p > 255)) return null;
  return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
}

function ipv6ToBigInt(ip: string): bigint | null {
  // Normalize via ipaddr-style expansion: handle '::' compression and hex groups.
  let head = ip;
  let tail = '';
  const hasDouble = ip.includes('::');
  if (hasDouble) {
    const [h, t] = ip.split('::');
    head = h;
    tail = t ?? '';
  }
  const headGroups = head ? head.split(':').filter(Boolean) : [];
  const tailGroups = tail ? tail.split(':').filter(Boolean) : [];
  const missing = 8 - headGroups.length - tailGroups.length;
  if (hasDouble && missing < 1) return null;
  const groups = [...headGroups, ...Array.from({ length: hasDouble ? missing : 0 }, () => '0'), ...tailGroups];
  if (groups.length !== 8) return null;

  let result = 0n;
  for (const g of groups) {
    const v = parseInt(g, 16);
    if (Number.isNaN(v)) return null;
    result = (result << 16n) | BigInt(v);
  }
  return result;
}

export function isPrivateIp(ip: string): boolean {
  if (isIP(ip) === 4) {
    const int = ipv4ToInt(ip);
    if (int === null) return true; // malformed — treat as unsafe
    return PRIVATE_V4.some(([base, prefix]) => {
      const mask = prefix === 0 ? 0 : (~0 << (32 - prefix)) >>> 0;
      return (int & mask) === (base & mask);
    });
  }
  if (isIP(ip) === 6) {
    const int = ipv6ToBigInt(ip);
    if (int === null) return true;
    return PRIVATE_V6.some(([base, prefix]) => {
      const shift = BigInt(128 - prefix);
      const mask = shift >= 128n ? 0n : (~0n << shift) & ((1n << 128n) - 1n);
      return (int & mask) === (base & mask);
    });
  }
  // Not a valid IP literal.
  return true;
}

/** Hostnames that must never be fetched (loopback/local DNS suffixes). */
const BLOCKED_HOSTNAMES = [
  'localhost',
  'localhost.localdomain',
];

function isBlockedHostname(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (BLOCKED_HOSTNAMES.includes(h)) return true;
  return h.endsWith('.local') || h.endsWith('.internal') || h.endsWith('.localhost');
}

/**
 * Returns true when the URL is safe for a server-side fetch: http/https scheme,
 * non-private host, and DNS resolution does not land on a private address.
 */
export async function isUrlSafeForFetch(rawUrl: string): Promise<boolean> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
  if (isBlockedHostname(parsed.hostname)) return false;

  const asIp = isIP(parsed.hostname);
  if (asIp !== 0) return !isPrivateIp(parsed.hostname);

  // Resolve DNS (best-effort) and reject private/reserved addresses.
  try {
    const { address } = await lookup(parsed.hostname, { verbatim: true });
    return !isPrivateIp(address);
  } catch {
    // Unable to resolve — reject rather than fetch an unresolvable host.
    return false;
  }
}

/** Synchronous fast-path used to drop obviously-unsafe URLs before DNS work. */
export function isObviouslyUnsafeUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return true;
    if (isBlockedHostname(parsed.hostname)) return true;
    if (isIP(parsed.hostname) !== 0) return isPrivateIp(parsed.hostname);
    return false;
  } catch {
    return true;
  }
}
