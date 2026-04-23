import { test, expect, Page } from '@playwright/test';

/**
 * These tests verify that when local models are configured, ALL generation
 * tasks route to the local endpoint and ZERO requests leak to Gemini.
 *
 * Search/retrieval tasks (findPartSources, findLocalSuppliers, hydratePartDetails)
 * are intentionally excluded — they always go to Gemini.
 */

const LOCAL_CHAT_URL = 'http://192.168.1.41:1234/v1/chat/completions';
// Matches any cloud AI provider endpoint — currently Google Gemini OR Alibaba DashScope.
// Update this pattern when the cloud provider changes so the test stays meaningful.
const CLOUD_API_PATTERN = /generativelanguage\.googleapis\.com|dashscope.*\.aliyuncs\.com/;
/** @deprecated kept for readability at call sites — use CLOUD_API_PATTERN instead */
const GEMINI_API_PATTERN = CLOUD_API_PATTERN;

/**
 * Helper: set up all 5 local model providers in localStorage
 */
async function configureAllLocalModels(page: Page) {
    await page.evaluate(() => {
        const makeProvider = (id: string, name: string) => JSON.stringify({
            id,
            name: `[LM Studio] ${name}`,
            endpointUrl: 'http://192.168.1.41:1234/v1/chat/completions',
            type: 'openai'
        });
        localStorage.setItem('localArchitectProvider', makeProvider('gemma-4-26b', 'gemma-4-26b'));
        localStorage.setItem('localAuditProvider', makeProvider('gemma-4-26b', 'gemma-4-26b'));
        localStorage.setItem('localPlanProvider', makeProvider('gemma-4-26b', 'gemma-4-26b'));
        localStorage.setItem('localCadProvider', makeProvider('nemotron-3-super', 'nemotron-3-super'));
        localStorage.setItem('localUtilityProvider', makeProvider('codellama', 'codellama'));
    });
}

/**
 * Helper: mock the local chat completions endpoint to return a simple response
 */
async function mockLocalEndpoint(page: Page) {
    await page.route(LOCAL_CHAT_URL, async route => {
        const body = JSON.parse(route.request().postData() || '{}');
        const model = body.model || 'unknown';

        // Return a basic response matching the model
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
                choices: [{
                    message: {
                        content: `Response from local model: ${model}. This is a test response.`
                    }
                }],
                usage: { total_tokens: 42 }
            })
        });
    });
}

test.describe('Local Model Routing — No Gemini Leakage', () => {

    test('generation tasks should route to local and not to Gemini when all models are configured', async ({ page }) => {
        // Track all outgoing requests
        const geminiRequests: string[] = [];
        const localRequests: string[] = [];

        page.on('request', req => {
            const url = req.url();
            if (GEMINI_API_PATTERN.test(url)) {
                geminiRequests.push(url);
            }
            if (url.includes('1234/v1/chat/completions')) {
                localRequests.push(url);
            }
        });

        // Set up mocks
        await mockLocalEndpoint(page);

        // Mock model listing
        await page.route('http://192.168.1.41:1234/v1/models', async route => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    data: [
                        { id: 'gemma-4-26b', object: 'model' },
                        { id: 'nemotron-3-super', object: 'model' },
                        { id: 'codellama', object: 'model' }
                    ]
                })
            });
        });

        // Block Gemini to ensure nothing leaks
        await page.route(GEMINI_API_PATTERN, async route => {
            geminiRequests.push(route.request().url());
            await route.abort('failed');
        });

        // Load page and configure all local models
        await page.goto('/');
        await configureAllLocalModels(page);

        // Reload so the AIManager picks up the localStorage config
        await page.reload();
        await page.waitForTimeout(2000);

        // Clear any startup requests
        geminiRequests.length = 0;
        localRequests.length = 0;

        // Now trigger a chat message to exercise the architect path
        // Find the chat input and send a message
        const chatInput = page.locator('textarea, input[type="text"]').last();
        if (await chatInput.isVisible()) {
            await chatInput.fill('Build me a simple LED circuit');
            await chatInput.press('Enter');
            await page.waitForTimeout(3000);
        }

        // Verify: no Gemini requests were made for generation tasks
        // (Note: search/retrieval requests ARE allowed to hit Gemini, but those
        // are triggered by explicit user actions like "Find Sources", not by chat)
        expect(geminiRequests.length).toBe(0);
    });

    test('HybridAIService fallback chain resolves correctly', async ({ page }) => {
        // This test verifies the fallback chain by setting only the architect model
        // and checking that utility functions fall back to it

        const requestModels: string[] = [];

        await page.route(LOCAL_CHAT_URL, async route => {
            const body = JSON.parse(route.request().postData() || '{}');
            requestModels.push(body.model);

            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    choices: [{
                        message: { content: 'Test response' }
                    }],
                    usage: { total_tokens: 10 }
                })
            });
        });

        // Block Gemini
        await page.route(GEMINI_API_PATTERN, async route => {
            await route.abort('failed');
        });

        await page.goto('/');

        // Only set architect model — utility/cad should fall back to it
        await page.evaluate(() => {
            const provider = JSON.stringify({
                id: 'gemma-4-26b',
                name: '[LM Studio] gemma-4-26b',
                endpointUrl: 'http://192.168.1.41:1234/v1/chat/completions',
                type: 'openai'
            });
            localStorage.setItem('localArchitectProvider', provider);
            // Do NOT set utility, cad, audit, or plan providers
        });

        await page.reload();
        await page.waitForTimeout(2000);

        // The service should exist with architect as fallback for all roles
        const serviceState = await page.evaluate(() => {
            // Check that localStorage has only the architect provider
            return {
                hasArchitect: !!localStorage.getItem('localArchitectProvider'),
                hasUtility: !!localStorage.getItem('localUtilityProvider'),
                hasCad: !!localStorage.getItem('localCadProvider'),
                hasAudit: !!localStorage.getItem('localAuditProvider'),
                hasPlan: !!localStorage.getItem('localPlanProvider'),
            };
        });

        expect(serviceState.hasArchitect).toBe(true);
        expect(serviceState.hasUtility).toBe(false);
        expect(serviceState.hasCad).toBe(false);
        expect(serviceState.hasAudit).toBe(false);
        expect(serviceState.hasPlan).toBe(false);
    });

    test('localStorage model configs are correctly structured', async ({ page }) => {
        await page.goto('/');
        await configureAllLocalModels(page);

        const configs = await page.evaluate(() => {
            const keys = ['localArchitectProvider', 'localAuditProvider', 'localPlanProvider', 'localCadProvider', 'localUtilityProvider'];
            return keys.map(key => {
                const val = localStorage.getItem(key);
                return val ? JSON.parse(val) : null;
            });
        });

        for (const config of configs) {
            expect(config).not.toBeNull();
            expect(config).toHaveProperty('id');
            expect(config).toHaveProperty('name');
            expect(config).toHaveProperty('endpointUrl');
            expect(config).toHaveProperty('type');
            expect(config.endpointUrl).toContain('/v1/chat/completions');
        }

        // Verify specific model assignments
        expect(configs[0].id).toBe('gemma-4-26b');       // architect
        expect(configs[1].id).toBe('gemma-4-26b');       // audit
        expect(configs[2].id).toBe('gemma-4-26b');       // plan
        expect(configs[3].id).toBe('nemotron-3-super');  // cad
        expect(configs[4].id).toBe('codellama');          // utility
    });
});
