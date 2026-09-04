import { test as setup } from '@playwright/test';

declare global {
  interface Window {
    __PLAYWRIGHT_TEST__: boolean;
  }
}

setup('set playwright test flag', async ({ page }) => {
  await page.addInitScript(() => {
    window.__PLAYWRIGHT_TEST__ = true;
  });
});