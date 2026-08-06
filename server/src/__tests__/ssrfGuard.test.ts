/**
 * Tests for the SSRF guard (S5).
 */
import { describe, it, expect } from 'vitest';
import { isPrivateIp, isObviouslyUnsafeUrl, isUrlSafeForFetch } from '../services/ssrfGuard.js';

describe('isPrivateIp', () => {
  it('flags loopback addresses', () => {
    expect(isPrivateIp('127.0.0.1')).toBe(true);
    expect(isPrivateIp('127.0.0.2')).toBe(true);
  });

  it('flags RFC1918 private ranges', () => {
    expect(isPrivateIp('10.0.0.1')).toBe(true);
    expect(isPrivateIp('192.168.1.1')).toBe(true);
    expect(isPrivateIp('172.16.0.1')).toBe(true);
    expect(isPrivateIp('172.31.255.255')).toBe(true);
  });

  it('flags link-local + cloud metadata', () => {
    expect(isPrivateIp('169.254.169.254')).toBe(true);
    expect(isPrivateIp('169.254.0.1')).toBe(true);
  });

  it('allows public addresses', () => {
    expect(isPrivateIp('8.8.8.8')).toBe(false);
    expect(isPrivateIp('1.1.1.1')).toBe(false);
    expect(isPrivateIp('203.0.113.10')).toBe(true); // TEST-NET-3, still private
  });

  it('flags IPv6 loopback and ULA', () => {
    expect(isPrivateIp('::1')).toBe(true);
    expect(isPrivateIp('::')).toBe(true);
    expect(isPrivateIp('fc00::1')).toBe(true);
    expect(isPrivateIp('fe80::1')).toBe(true);
  });

  it('allows public IPv6', () => {
    expect(isPrivateIp('2606:4700:4700::1111')).toBe(false);
  });

  it('treats malformed input as unsafe', () => {
    expect(isPrivateIp('not-an-ip')).toBe(true);
  });
});

describe('isObviouslyUnsafeUrl', () => {
  it('rejects non-http(s) schemes', () => {
    expect(isObviouslyUnsafeUrl('file:///etc/passwd')).toBe(true);
    expect(isObviouslyUnsafeUrl('ftp://example.com')).toBe(true);
    expect(isObviouslyUnsafeUrl('javascript:alert(1)')).toBe(true);
  });

  it('rejects localhost and .local/.internal hostnames', () => {
    expect(isObviouslyUnsafeUrl('http://localhost:3002/x')).toBe(true);
    expect(isObviouslyUnsafeUrl('http://db.internal:5432/')).toBe(true);
    expect(isObviouslyUnsafeUrl('http://router.local/')).toBe(true);
  });

  it('rejects private IP literals', () => {
    expect(isObviouslyUnsafeUrl('http://127.0.0.1:8080/')).toBe(true);
    expect(isObviouslyUnsafeUrl('http://10.0.0.5/')).toBe(true);
    expect(isObviouslyUnsafeUrl('http://169.254.169.254/latest/meta-data')).toBe(true);
  });

  it('allows public URLs', () => {
    expect(isObviouslyUnsafeUrl('https://example.com/product/1')).toBe(false);
    expect(isObviouslyUnsafeUrl('http://8.8.8.8/')).toBe(false);
  });

  it('rejects malformed URLs', () => {
    expect(isObviouslyUnsafeUrl('not a url')).toBe(true);
  });
});

describe('isUrlSafeForFetch', () => {
  it('resolves a public hostname to a public IP', async () => {
    // example.com is a stable public host; guard should allow it.
    expect(await isUrlSafeForFetch('https://example.com/')).toBe(true);
  });

  it('rejects a hostname that resolves to a private address', async () => {
    // localhost resolves to 127.0.0.1/::1 — guarded by hostname block already.
    expect(await isUrlSafeForFetch('http://localhost:3002/')).toBe(false);
  });

  it('rejects unresolvable hostnames', async () => {
    expect(await isUrlSafeForFetch('http://nonexistent-host-xyz-12345.invalid/')).toBe(false);
  });
});
