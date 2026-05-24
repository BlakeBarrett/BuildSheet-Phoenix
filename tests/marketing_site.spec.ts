import { test, expect } from '@playwright/test';

// The marketing site is currently served on localhost:8099 during this session
const SITE_URL = 'http://localhost:8080';

test.describe('Marketing Site — Blue Collar Redesign', () => {
  
  test.beforeEach(async ({ page }) => {
    await page.goto(SITE_URL);
  });

  test('Hero section displays the correct industrial copy', async ({ page }) => {
    // Check for the "Built for Builders" badge
    const badge = page.locator('.hero__badge');
    await expect(badge).toContainText('Built for Builders');

    // Check for the main headline
    const headline = page.locator('.hero h1');
    await expect(headline).toContainText('Stop guessing. Start building.');

    // Check for the subtitle with practical language
    const subtitle = page.locator('.hero__subtitle');
    await expect(subtitle).toContainText('framing a house, wiring a shop');
  });

  test('Features section uses "Your Toolbox" branding', async ({ page }) => {
    const sectionHeader = page.locator('#features .section-header');
    await expect(sectionHeader.locator('h2')).toContainText('get the job done');
    await expect(sectionHeader.locator('.badge')).toContainText('Your Toolbox');

    // Check individual card titles (industrial language)
    const cardTitles = page.locator('.card__title');
    await expect(cardTitles).toContainText(['AI Parts List Generator', 'Real-Time Pricing', 'Visual Build View']);
  });

  test('How It Works steps are direct and action-oriented', async ({ page }) => {
    const steps = page.locator('.step__title');
    await expect(steps).toHaveText(['Tell It', 'Check It', 'Build It']);
  });

  test('Pricing tiers are targeted at the new demographic', async ({ page }) => {
    const freeDesc = page.locator('.pricing-card').nth(0).locator('.pricing-card__description');
    await expect(freeDesc).toContainText('weekend projects');

    const proDesc = page.locator('.pricing-card').nth(1).locator('.pricing-card__description');
    await expect(proDesc).toContainText('serious builders and working contractors');

    const teamFeatures = page.locator('.pricing-card').nth(2).locator('.pricing-card__feature');
    await expect(teamFeatures).toContainText(['Share projects with your crew', 'Control who can view and edit']);
  });

  test('On-Prem section focuses on control and offline use', async ({ page }) => {
    const onPrem = page.locator('#on-prem');
    await expect(onPrem.locator('.badge')).toContainText('Full Control');
    await expect(onPrem.locator('h2')).toContainText('your own hardware');
    
    const features = onPrem.locator('.on-prem__features li');
    await expect(features).toContainText(['no internet required', 'offline']);
  });

  test('FAQ answers use plain, practical language', async ({ page }) => {
    const faq3 = page.locator('#faq-btn-3');
    await expect(faq3).toContainText('How does the AI know what parts I need?');
    
    const faq3Body = page.locator('#faq-content-3');
    await expect(faq3Body).toContainText('2x4 and a 4x4');
    await expect(faq3Body).toContainText('12-gauge and 14-gauge wire');
  });

  test('Footer displays the correct brand description', async ({ page }) => {
    const footerDesc = page.locator('.footer__brand-description');
    await expect(footerDesc).toContainText('contractors, DIYers, and anyone who builds');
  });

  test('Theme toggle is functional', async ({ page }) => {
    const toggle = page.locator('#theme-toggle');
    
    // Get initial theme (could be light or dark based on system preference)
    const initialTheme = await page.locator('html').getAttribute('data-theme');
    const expectedAfterFirstClick = initialTheme === 'light' ? 'dark' : 'light';
    
    // Toggle theme
    await toggle.click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', expectedAfterFirstClick);
    
    // Toggle back
    await toggle.click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', initialTheme!);
  });
});
