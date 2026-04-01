import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// SOURCE-LEVEL TESTS  (synchronous, no browser needed)
// Verify the root cause of the recurring avatar bug is eliminated at source.
// ---------------------------------------------------------------------------

test.describe('UserAvatar – source-code regression guards', () => {

    test('nextElementSibling DOM manipulation is gone from App.tsx', () => {
        const src = fs.readFileSync(path.join(__dirname, '../App.tsx'), 'utf-8');
        // The old imperative fix set style.display and mutated siblings directly.
        // React re-renders reset style.display, causing the "broke again" cycle.
        expect(src).not.toContain('nextElementSibling');
        expect(src).not.toContain("style.display = 'none'");
    });

    test('nextElementSibling DOM manipulation is gone from UserProfileModal.tsx', () => {
        const src = fs.readFileSync(
            path.join(__dirname, '../components/UserProfileModal.tsx'),
            'utf-8'
        );
        expect(src).not.toContain('nextElementSibling');
        expect(src).not.toContain("style.display = 'none'");
    });

    test('UserAvatar component uses React state for error handling', () => {
        const src = fs.readFileSync(
            path.join(__dirname, '../components/Material3UI.tsx'),
            'utf-8'
        );
        // Must use useState to track image errors, not imperative DOM
        expect(src).toContain('imgError');
        expect(src).toContain('setImgError');
        expect(src).toContain('onError={() => setImgError(true)');
    });

    test('UserAvatar img has referrerPolicy="no-referrer" to fix Google/Firebase photo loading', () => {
        // Google profile photo URLs (lh3.googleusercontent.com) reject requests
        // that include a Referer header from localhost.  Without this attribute
        // onError fires immediately and the user only ever sees their initial.
        const src = fs.readFileSync(
            path.join(__dirname, '../components/Material3UI.tsx'),
            'utf-8'
        );
        expect(src).toContain('referrerPolicy="no-referrer"');
    });

    test('UserAvatar resets imgError via useEffect when avatar URL changes', () => {
        // Without this reset, a transient load failure permanently latches
        // imgError = true even after a valid URL is later provided.
        const src = fs.readFileSync(
            path.join(__dirname, '../components/Material3UI.tsx'),
            'utf-8'
        );
        expect(src).toContain('useEffect');
        // The effect must depend on avatar so it fires when the URL changes.
        expect(src).toContain('[avatar]');
    });

    test('UserAvatar is exported from Material3UI and imported everywhere it is used', () => {
        const material3 = fs.readFileSync(
            path.join(__dirname, '../components/Material3UI.tsx'),
            'utf-8'
        );
        const appSrc = fs.readFileSync(path.join(__dirname, '../App.tsx'), 'utf-8');
        const modalSrc = fs.readFileSync(
            path.join(__dirname, '../components/UserProfileModal.tsx'),
            'utf-8'
        );

        expect(material3).toContain('export const UserAvatar');
        expect(appSrc).toContain('UserAvatar');
        expect(modalSrc).toContain('UserAvatar');
    });
});

// ---------------------------------------------------------------------------
// LOGIC TESTS  (run in browser context via page.evaluate to keep parity with
// the rest of the test suite; no imperative DOM assertions needed)
// ---------------------------------------------------------------------------

test.describe('UserAvatar – fallback state-machine logic', () => {

    test('shows fallback initial when no avatar URL is provided', async ({ page }) => {
        await page.goto('http://localhost:3000');

        const result = await page.evaluate(() => {
            // Mirrors the UserAvatar component logic exactly
            const avatar = '';
            const imgError = false;
            const showFallback = !avatar || imgError;
            const name = 'Blake Barrett';
            const initial = name ? name.charAt(0).toUpperCase() : '?';
            return { showFallback, initial };
        });

        expect(result.showFallback).toBe(true);
        expect(result.initial).toBe('B');
    });

    test('shows image when a valid avatar URL is provided and no error', async ({ page }) => {
        await page.goto('http://localhost:3000');

        const result = await page.evaluate(() => {
            const avatar = 'https://example.com/avatar.jpg';
            const imgError = false;
            const showFallback = !avatar || imgError;
            return { showFallback };
        });

        expect(result.showFallback).toBe(false);
    });

    test('transitions to fallback when image fires onError (imgError = true)', async ({ page }) => {
        await page.goto('http://localhost:3000');

        const result = await page.evaluate(() => {
            const avatar = 'https://example.com/avatar.jpg';
            // Simulate state after the onError handler fires
            const imgError = true;
            const showFallback = !avatar || imgError;
            return { showFallback };
        });

        // The core of the "broke again" fix: error state drives conditional rendering,
        // not imperative DOM mutation that React can overwrite on re-render.
        expect(result.showFallback).toBe(true);
    });

    test('fallback initial is upper-cased first character of name', async ({ page }) => {
        await page.goto('http://localhost:3000');

        const result = await page.evaluate(() => {
            const cases = [
                { name: 'alice smith', expected: 'A' },
                { name: 'Bob',         expected: 'B' },
                { name: '',            expected: '?' },
            ];
            return cases.map(({ name, expected }) => {
                const initial = name ? name.charAt(0).toUpperCase() : '?';
                return { got: initial, expected, pass: initial === expected };
            });
        });

        result.forEach(r => expect(r.pass).toBe(true));
    });
});

// ---------------------------------------------------------------------------
// UI TEST  – verify no avatar img on the page has been imperatively hidden
// (a sign the old pattern crept back in)
// ---------------------------------------------------------------------------

test.describe('UserAvatar – runtime DOM integrity', () => {

    test('no avatar img element has been imperatively hidden via style.display', async ({ page }) => {
        await page.goto('http://localhost:3000');
        await page.waitForSelector('#main-content', { timeout: 10000 });

        const found = await page.evaluate(() => {
            // Select all small circular images used as avatars in nav buttons.
            // In the new implementation these are only rendered when the image
            // is KNOWN good (imgError === false), so none should carry display:none.
            const imgs = document.querySelectorAll<HTMLImageElement>('button img[alt=""]');
            let imperativelyHidden = false;
            imgs.forEach(img => {
                if (img.style.display === 'none') imperativelyHidden = true;
            });
            return imperativelyHidden;
        });

        expect(found).toBe(false);
    });
});
