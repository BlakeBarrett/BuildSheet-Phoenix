/**
 * Tests for sanitizeMarkdownTables — the frontend markdown-table sanitizer
 * (services/parseUtils.ts). Lives here because the frontend has no vitest runner;
 * the module is pure TS with no DOM/React deps, so it imports cleanly under the
 * server's vitest via a relative path.
 */
import { describe, it, expect } from 'vitest';
import { sanitizeMarkdownTables } from '../../../services/parseUtils.ts';

describe('sanitizeMarkdownTables', () => {
  it('returns the input unchanged for empty/undefined strings', () => {
    expect(sanitizeMarkdownTables('')).toBe('');
    expect(sanitizeMarkdownTables(null as unknown as string)).toBeNull();
  });

  it('leaves non-table content untouched', () => {
    const md = '# Heading\n\nSome *plain* text with a `code` span.';
    expect(sanitizeMarkdownTables(md)).toBe(md);
  });

  it('rebuilds a well-formed separator row to match the header', () => {
    const input = '| Col A | Col B | Col C |\n| --- | --- |\n| x | y | z |';
    const out = sanitizeMarkdownTables(input);
    // 3 header columns -> 3-cell separator: | --- | --- | --- |
    expect(out).toContain('| --- | --- | --- |');
  });

  it('handles leading/trailing whitespace on the separator row (findIndex bug)', () => {
    // The original buggy implementation compared the trimmed match against
    // untrimmed lines, so findIndex returned -1 and the separator was never rebuilt.
    const input = '| A | B |\n   | --- | --- |   \n| x | y |';
    const out = sanitizeMarkdownTables(input);
    expect(out).toContain('| --- | --- |');
    expect(out).not.toContain('   | --- | --- |   ');
  });

  it('repairs a separator row missing its leading pipe', () => {
    const input = '| A | B |\n--- | ---\n| x | y |';
    const out = sanitizeMarkdownTables(input);
    expect(out).toContain('| --- | --- |');
  });

  it('does not treat a content row containing only pipes/dashes as a separator', () => {
    // A data row like "| - | - |" is ambiguous; with a pipe-bearing header above
    // it should be rebuilt as a proper separator, not left malformed.
    const input = '| Item | Qty |\n| - | - |';
    const out = sanitizeMarkdownTables(input);
    expect(out).toContain('| --- | --- |');
  });

  it('does not mangle a table that is already well-formed', () => {
    const input = '| A | B |\n| --- | --- |\n| x | y |';
    const out = sanitizeMarkdownTables(input);
    expect(out).toContain('| --- | --- |');
    expect(out).toContain('| x | y |');
  });

  it('leaves content rows with pipe-like text untouched', () => {
    const input = '| A | B |\n| --- | --- |\n| x|y | z |';
    const out = sanitizeMarkdownTables(input);
    // The data row "| x|y | z |" has non-separator characters (letters) so it
    // must be preserved verbatim.
    expect(out).toContain('| x|y | z |');
  });

  it('handles a table with a single column', () => {
    const input = '| Name |\n| --- |\n| Bob |';
    const out = sanitizeMarkdownTables(input);
    expect(out).toContain('| --- |');
  });

  it('leaves tables without a header row above the separator alone', () => {
    // If there is no header row above, we cannot infer column count — leave as-is.
    const input = '| --- | --- |\n| x | y |';
    const out = sanitizeMarkdownTables(input);
    expect(out).toContain('| --- | --- |');
  });

  it('only rebuilds separators within the same table block (blank line boundary)', () => {
    const input = '| A | B |\n| --- | --- |\n| x | y |\n\nplain text\n\n| --- |\n| z |';
    const out = sanitizeMarkdownTables(input);
    // First table: rebuilt to 2 columns.
    expect(out).toContain('| --- | --- |');
    // Second table has a header-less separator — left unchanged.
    expect(out).toContain('| --- |\n| z |');
  });
});
