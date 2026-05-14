import { test, expect } from '@playwright/test';

test.describe('Link Sharing Behavior', () => {

    test('should show error toast when share API fails', async ({ page }) => {
        // 1. Pre-seed localStorage with a session that has a BOM
        const mockSession = {
            id: 'share-test-1',
            slug: 'build-share',
            name: 'Share Link UI Test',
            ownerId: 'test-user',
            designRequirements: 'Test',
            bom: [
                {
                    instanceId: 'pi-zero-001',
                    quantity: 1,
                    part: { id: 'pi-zero-2w', sku: '', name: 'Raspberry Pi Zero 2 W', category: 'Microcontroller', brand: 'Raspberry Pi', price: 15, ports: [], description: 'Compact SBC' },
                    sourcing: {}
                }
            ],
            generatedImages: [],
            messages: [],
            createdAt: new Date().toISOString(),
            lastModified: new Date().toISOString(),
            cacheIsDirty: false
        };

        await page.addInitScript((session) => {
            localStorage.setItem('buildsheet_active_project_id', session.id);
            localStorage.setItem(`buildsheet_project_${session.id}`, JSON.stringify(session));
            localStorage.setItem('buildsheet_projects_index', JSON.stringify([{ id: session.id, name: session.name, lastModified: session.lastModified, preview: '' }]));
        }, mockSession);

        // 2. Mock the sharesApi endpoint to fail with 500 error
        await page.route('**/api/v1/shares', async route => {
            await route.fulfill({
                status: 500,
                contentType: 'application/json',
                body: JSON.stringify({ error: 'Internal Server Error' })
            });
        });

        // 3. Navigate to app
        await page.goto('/');
        await page.waitForTimeout(1000);

        // Dismiss cookie consent dialog if present
        const acceptAll = page.locator('button:has-text("Accept All")');
        if (await acceptAll.isVisible({ timeout: 2000 }).catch(() => false)) {
            await acceptAll.click();
            await page.waitForTimeout(300);
        }

        // 4. Click the Share button
        const shareButton = page.getByTitle('Share this build');
        await expect(shareButton).toBeVisible();
        await shareButton.click();

        // 5. Verify the error toast appears
        const errorToast = page.locator('text=✗ Failed to create link');
        await expect(errorToast).toBeVisible({ timeout: 5000 });
    });

});
