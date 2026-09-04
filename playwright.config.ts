import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:8080/app/',
    trace: 'on-first-retry',
    // Set test flag on all pages to enable test-safe defaults (e.g., fast-fail URLs)
    initScript: 'window.__PLAYWRIGHT_TEST__ = true;',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: {
          args: ['--disable-web-security'],
        },
      },
    },
  ],
  // Our container serves everything; skip the local webServer.
  // (in CI this should be re-enabled with the proper base URL)
});
