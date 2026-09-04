import { test, expect } from '@playwright/test';

test.describe('Settings Modal — Debranding Verification', () => {
    test.beforeEach(async ({ page }) => {
        // Pre-set consent to skip Privacy & Data Control modal
        await page.addInitScript(() => {
            localStorage.setItem('buildsheet_consent', 'full');
        });

        // Mock the LM Studio / Ollama scans so the model selectors render
        // immediately (the modal otherwise waits on real LAN hosts).
        await page.route('http://192.168.1.41:1234/v1/models', async route => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ data: [{ id: 'gemma-4-26b', object: 'model' }] })
            });
        });
        await page.route('http://192.168.1.41:11434/api/tags', async route => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ models: [{ name: 'phi-3' }] })
            });
        });
    });

    test('should display cloud-agnostic terminology instead of Gemini', async ({ page }) => {
        await page.goto('/app/');
        await page.waitForTimeout(1000);

        // Open Settings Modal
        await page.getByRole('button', { name: 'Settings' }).click();
        await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();

        // Verify "Default (Cloud API)" appears instead of "Default (Gemini Cloud API)"
        const defaultOption = page.locator('select#local-model option[value=""]');
        await expect(defaultOption).toHaveText('Default (Cloud API)');

        // Verify no "Gemini" text appears in model labels
        const labels = page.locator('label').allTextContents();
        const combinedLabels = (await labels).join(' ');
        expect(combinedLabels).not.toContain('Gemini');

        // Verify "Local Architect Model" label is present
        await expect(page.locator('label[for="local-model"]')).toContainText('Local Architect Model');
    });
});

test.describe('Settings Modal — All Model Selectors', () => {

    test.beforeEach(async ({ page }) => {
        // Pre-set consent to skip Privacy & Data Control modal
        await page.addInitScript(() => {
            localStorage.setItem('buildsheet_consent', 'full');
        });

        // Mock LM Studio response
        await page.route('http://192.168.1.41:1234/v1/models', async route => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    data: [
                        { id: 'gemma-4-26b', object: 'model' },
                        { id: 'nemotron-3-super', object: 'model' },
                        { id: 'llama-3-8b', object: 'model' }
                    ]
                })
            });
        });

        // Mock Ollama response
        await page.route('http://192.168.1.41:11434/api/tags', async route => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    models: [
                        { name: 'phi-3' },
                        { name: 'codellama' }
                    ]
                })
            });
        });

        await page.goto('/app/');
        await page.waitForTimeout(1000);
    });

    test('should save all 5 model selectors to localStorage correctly', async ({ page }) => {
        // Open Settings Modal
        await page.getByRole('button', { name: 'Settings' }).click();
        await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();

        // Select models for all 5 slots
        await page.locator('select#local-model').selectOption('gemma-4-26b');
        await page.locator('select#audit-model').selectOption('llama-3-8b');
        await page.locator('select#plan-model').selectOption('phi-3');
        await page.locator('select#cad-model').selectOption('nemotron-3-super');
        await page.locator('select#utility-model').selectOption('codellama');

        // Save
        await page.getByRole('button', { name: 'Save' }).click();
        await expect(page.getByRole('heading', { name: 'Settings' })).not.toBeVisible();

        // Verify all localStorage keys
        const architectProvider = await page.evaluate(() => localStorage.getItem('localArchitectProvider'));
        const auditProvider = await page.evaluate(() => localStorage.getItem('localAuditProvider'));
        const planProvider = await page.evaluate(() => localStorage.getItem('localPlanProvider'));
        const cadProvider = await page.evaluate(() => localStorage.getItem('localCadProvider'));
        const utilityProvider = await page.evaluate(() => localStorage.getItem('localUtilityProvider'));

        expect(architectProvider).not.toBeNull();
        expect(auditProvider).not.toBeNull();
        expect(planProvider).not.toBeNull();
        expect(cadProvider).not.toBeNull();
        expect(utilityProvider).not.toBeNull();

        expect(JSON.parse(architectProvider!).id).toBe('gemma-4-26b');
        expect(JSON.parse(auditProvider!).id).toBe('llama-3-8b');
        expect(JSON.parse(planProvider!).id).toBe('phi-3');
        expect(JSON.parse(cadProvider!).id).toBe('nemotron-3-super');
        expect(JSON.parse(utilityProvider!).id).toBe('codellama');
    });

    test('should clear model selections when set back to default', async ({ page }) => {
        // Pre-populate localStorage
        await page.evaluate(() => {
            localStorage.setItem('localCadProvider', JSON.stringify({ id: 'nemotron-3-super', name: 'test', endpointUrl: 'http://test', type: 'openai' }));
            localStorage.setItem('localUtilityProvider', JSON.stringify({ id: 'codellama', name: 'test', endpointUrl: 'http://test', type: 'ollama' }));
        });

        await page.getByRole('button', { name: 'Settings' }).click();
        await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();

        // Set back to defaults
        await page.locator('select#cad-model').selectOption('');
        await page.locator('select#utility-model').selectOption('');

        await page.getByRole('button', { name: 'Save' }).click();

        const cadProvider = await page.evaluate(() => localStorage.getItem('localCadProvider'));
        const utilityProvider = await page.evaluate(() => localStorage.getItem('localUtilityProvider'));

        expect(cadProvider).toBeNull();
        expect(utilityProvider).toBeNull();
    });

    test('should persist selections across modal open/close', async ({ page }) => {
        // Set up models in localStorage  
        await page.evaluate(() => {
            localStorage.setItem('localCadProvider', JSON.stringify({ id: 'nemotron-3-super', name: '[LM Studio] nemotron-3-super', endpointUrl: 'http://192.168.1.41:1234/v1/chat/completions', type: 'openai' }));
            localStorage.setItem('localUtilityProvider', JSON.stringify({ id: 'codellama', name: '[Ollama] codellama', endpointUrl: 'http://192.168.1.41:11434/v1/chat/completions', type: 'ollama' }));
        });

        // Open settings and verify values are pre-selected
        await page.getByRole('button', { name: 'Settings' }).click();

        await expect(page.locator('select#cad-model')).toHaveValue('nemotron-3-super');
        await expect(page.locator('select#utility-model')).toHaveValue('codellama');
    });
});
