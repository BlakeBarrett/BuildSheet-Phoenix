import { test, expect } from '@playwright/test';

test.describe('Settings Modal Local AI Config', () => {

    test.beforeEach(async ({ page }) => {
        // Mock LM Studio response
        await page.route('http://192.168.1.41:1234/v1/models', async route => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    data: [
                        { id: 'llama-3-8b', object: 'model' },
                        { id: 'gemma-4-26b', object: 'model' }
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
                        { name: 'phi-3' }
                    ]
                })
            });
        });

        // Load the page
        await page.goto('/');

        // Wait to make sure the app loads fully
        await page.waitForTimeout(2000); 
    });

    test('should save architect, audit, and plan models respectively to localStorage in correct order', async ({ page }) => {
        // Open Settings Modal
        await page.getByRole('button', { name: 'Settings' }).click();

        // Check if the modal is visible
        await expect(page.getByRole('heading', { name: 'AI Settings' })).toBeVisible();

        // The mock should have populated the models
        // Select an Architect Model
        await page.locator('select#local-model').selectOption('gemma-4-26b');

        // Select an Audit Model
        await page.locator('select#audit-model').selectOption('llama-3-8b');

        // Select a Plan Model
        await page.locator('select#plan-model').selectOption('phi-3');

        // Click Save Changes
        await page.getByRole('button', { name: 'Save Changes' }).click();

        // Settings modal should close
        await expect(page.getByRole('heading', { name: 'AI Settings' })).not.toBeVisible();

        // Now, we retrieve values from localStorage to ensure they were saved successfully
        const localArchitectProvider = await page.evaluate(() => localStorage.getItem('localArchitectProvider'));
        const localAuditProvider = await page.evaluate(() => localStorage.getItem('localAuditProvider'));
        const localPlanProvider = await page.evaluate(() => localStorage.getItem('localPlanProvider'));

        expect(localArchitectProvider).not.toBeNull();
        expect(localAuditProvider).not.toBeNull();
        expect(localPlanProvider).not.toBeNull();

        const architectParsed = JSON.parse(localArchitectProvider!);
        const auditParsed = JSON.parse(localAuditProvider!);
        const planParsed = JSON.parse(localPlanProvider!);

        expect(architectParsed.id).toBe('gemma-4-26b');
        expect(auditParsed.id).toBe('llama-3-8b');
        expect(planParsed.id).toBe('phi-3');
    });
});
