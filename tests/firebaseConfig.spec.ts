/**
 * Firebase Config Verification — Playwright tests for the client-side chain.
 *
 * These tests verify that the React SPA can correctly read Firebase config
 * from the containerized env-config.js at runtime.
 *
 * Run: npx playwright test tests/firebaseConfig.spec.ts
 *
 * Prerequisites:
 *   - Container must be running (startup_local.sh)
 *   - .env must have real VITE_FIREBASE_* keys
 */

import { test, expect } from '@playwright/test';

// ──────────────────────────────────────────────────────────────────────────────
// Container tests (against the Docker container at localhost:8080)
// These verify the containerized production path works.
// ──────────────────────────────────────────────────────────────────────────────

test.describe('Container Firebase Configuration', () => {
  const BASE_URL = 'http://localhost:8080';

  test('env-config.js loads and sets window._env_ with real Firebase config', async ({ page }) => {
    // Navigate to the React SPA — this loads env-config.js as a <script> tag
    const response = await page.goto(`${BASE_URL}/app/`);
    expect(response?.status()).toBe(200);

    // Wait for env-config.js to execute (set window._env_)
    await page.waitForFunction(() => (window as any)._env_ !== undefined, {
      timeout: 10000,
    });

    // Now read window._env_
    const envConfig = await page.evaluate(() => (window as any)._env_ || {});

    expect(typeof envConfig).toBe('object');
    expect(envConfig).toHaveProperty('VITE_FIREBASE_API_KEY');
    expect(envConfig).toHaveProperty('VITE_FIREBASE_PROJECT_ID');
    expect(envConfig).toHaveProperty('VITE_FIREBASE_APP_ID');
    expect(envConfig).toHaveProperty('VITE_FIREBASE_MEASUREMENT_ID');

    // Verify key lengths (real keys have specific lengths)
    const apiKey = envConfig.VITE_FIREBASE_API_KEY;
    expect(apiKey).toMatch(/^AIzaSy/);
    expect(apiKey.length).toBe(39);

    const projectId = envConfig.VITE_FIREBASE_PROJECT_ID;
    expect(projectId.length).toBeGreaterThan(3);

    const appId = envConfig.VITE_FIREBASE_APP_ID;
    expect(appId.length).toBeGreaterThanOrEqual(41);

    const measurementId = envConfig.VITE_FIREBASE_MEASUREMENT_ID;
    expect(measurementId).toMatch(/^G-[A-Z0-9]+$/);
  });

  test('env-config.js blocks stubbed or truncated keys', async ({ page }) => {
    // Navigate to the React SPA (loads env-config.js with the container's .env)
    await page.goto(`${BASE_URL}/app/`);

    await page.waitForFunction(() => (window as any)._env_ !== undefined, {
      timeout: 10000,
    });

    const envConfig = await page.evaluate(() => (window as any)._env_ || {});
    const apiKey = envConfig.VITE_FIREBASE_API_KEY;

    // Real key is 39 chars, NOT a truncated stub like "AIzaSy...FzEA"
    expect(apiKey).not.toMatch(/\.+\.+/);  // no "..." pattern
    expect(apiKey).not.toMatch(/placeholder|stub|fake|test-key|your-/i);
    expect(apiKey.length).toBe(39);
  });

  test('React SPA initializes with real Firebase config', async ({ page }) => {
    await page.goto(`${BASE_URL}/app/`);

    await page.waitForFunction(() => (window as any)._env_ !== undefined, {
      timeout: 10000,
    });

    // Replicate the env() function from services/firebase.ts
    const result = await page.evaluate(() => {
      function getEnv(key: string): string {
        const metaEnv = (globalThis as any).import?.meta?.env;
        return (metaEnv?.[key] as string)
          || ((globalThis as any)._env_?.[key] as string)
          || '';
      }

      const projectId = getEnv('VITE_FIREBASE_PROJECT_ID');
      const apiKey = getEnv('VITE_FIREBASE_API_KEY');

      return {
        configured: !!projectId && !!apiKey,
        projectId,
        apiKey: apiKey ? `AIza...${apiKey.slice(-4)}` : '',
        keyLength: apiKey?.length || 0,
        authDomain: getEnv('VITE_FIREBASE_AUTH_DOMAIN'),
        storageBucket: getEnv('VITE_FIREBASE_STORAGE_BUCKET'),
      };
    });

    expect(result.configured).toBe(true);
    expect(result.keyLength).toBe(39);
    expect(result.projectId.length).toBeGreaterThan(3);
    expect(result.authDomain.length).toBeGreaterThan(3);
    expect(result.storageBucket.length).toBeGreaterThan(3);
  });

  test('React SPA renders without crashing', async ({ page }) => {
    await page.goto(`${BASE_URL}/app/`);

    // The SPA should render — check for any content
    const bodyText = await page.evaluate(() => document.body.innerText);
    expect(bodyText.length).toBeGreaterThan(10);

    // Check no unhandled console errors about Firebase config
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    await page.waitForLoadState('networkidle');

    // No Firebase-related errors in console
    const firebaseErrors = consoleErrors.filter(
      (e) => e.toLowerCase().includes('firebase') || e.toLowerCase().includes('auth')
    );
    expect(firebaseErrors).toHaveLength(0);
  });
});
