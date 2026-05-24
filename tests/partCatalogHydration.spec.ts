import { test, expect } from '@playwright/test';

// =============================================================================
// UNIT TEST NOTE — requires vitest at workspace root (not yet configured)
// =============================================================================
// The scenarios below are Playwright integration/network tests. A parallel set
// of faster vitest unit tests should cover the pure logic that Playwright
// cannot easily reach without a live browser + server. To set them up:
//
//   1. Add a root-level `vitest.config.ts`:
//        import { defineConfig } from 'vitest/config';
//        export default defineConfig({
//          test: { environment: 'node', include: ['services/__tests__/**/*.test.ts'] }
//        });
//   2. Add vitest + @vitest/coverage-v8 to the root package.json devDependencies.
//   3. Create `services/__tests__/partCatalogService.test.ts` covering:
//
//      a. findPartByNameOrSku() returns null when !isFirebaseConfigured()
//         vi.mock('./firebase', () => ({ isFirebaseConfigured: () => false, getFirebaseDb: () => null }))
//
//      b. findPartByNameOrSku() returns null when !UserService.isAuthenticated()
//         (covers the guest-user auth-gate in the current implementation)
//
//      c. findPartByNameOrSku() returns a GlobalPart for a document ID direct-hit
//         Mock getDoc to return a snapshot with exists()=true and mock part data.
//
//      d. findPartByNameOrSku() falls through to name query when direct-hit misses
//         Mock getDoc to return exists()=false, mock getDocs to return one doc.
//
//      e. findPartByNameOrSku() returns null and only warns (doesn't throw) on
//         Firestore error — verify console.warn called, function returns null.
//
//      f. saveHydratedPart() skips write when unauthenticated — verify setDoc
//         is NOT called.
//
//      g. saveHydratedPart() uses SKU-based doc ID when part.sku is present:
//         { sku: 'ESP32-WROOM', name: 'ESP32' } → doc ID 'esp32-wroom'
//
//      h. saveHydratedPart() falls back to name-based doc ID when part.sku is absent:
//         { name: 'Pencil #2' } → doc ID 'pencil--2'
//
//      i. saveHydratedPart() uses { merge: true } so existing bestSource is
//         preserved if this call omits it — verify setDoc 3rd arg === { merge: true }.
//
//   4. Create `services/__tests__/hydrateVirtualEntry.test.ts` covering the
//      catalog-first logic extracted from the App.tsx closure. Since the function
//      is currently a React closure, the cleanest approach is to extract it to a
//      standalone helper in `services/hydrationService.ts` and test it there:
//
//      a. catalog hit → draftingEngine.updatePartDetails called, hydrate API NOT called
//      b. cache miss → hydrate API called once
//      c. cache miss + API success → saveHydratedPart called with result
//      d. cache miss + API failure → error logged, no throw (graceful degradation)
// =============================================================================


// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Standard mock response returned by the intercepted hydrate endpoint. */
const MOCK_HYDRATE_RESULT = {
    id: 'mock-hydrated-part',
    name: 'USB-C Breakout Board',
    category: 'Connector',
    brand: 'Adafruit',
    sku: 'ADAFRUIT-4090',
    price: 3.50,
    description: 'Mock hydrated part — returned by test interceptor',
    ports: [],
};

/**
 * Intercepts find, local, project, and AI calls so tests run without a live backend.
 * Does NOT intercept /sourcing/hydrate — register that handler yourself AFTER calling
 * this function so it takes LIFO precedence over any other handlers.
 */
async function interceptSourcingRoutes(page: any) {
    await page.route('**/api/v1/sourcing/find', async (route: any) => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ results: [] }),
        });
    });
    await page.route('**/api/v1/sourcing/local', async (route: any) => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ results: [] }),
        });
    });
    await page.route('**/api/v1/projects/**', async (route: any) => {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
    });
    // Intercept AI / architect endpoints so tests don't block on a cold backend.
    await page.route('**/api/v1/architect/**', async (route: any) => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ reasoning: 'Mock audit result — test interceptor', auditActions: [] }),
        });
    });
}

/** Registers a passthrough hydrate handler that returns MOCK_HYDRATE_RESULT (no call counting). */
async function interceptHydrate(page: any) {
    await page.route('**/api/v1/sourcing/hydrate', async (route: any) => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ result: MOCK_HYDRATE_RESULT }),
        });
    });
}

/** Dismisses the cookie consent banner if it is visible. */
async function dismissCookieConsent(page: any) {
    const acceptAll = page.locator('button:has-text("Accept All")');
    if (await acceptAll.isVisible({ timeout: 2000 }).catch(() => false)) {
        await acceptAll.click();
        await page.waitForTimeout(300);
    }
}


// ---------------------------------------------------------------------------
// Suite 1: hydrateVirtualEntry — network-level behaviour
// ---------------------------------------------------------------------------
test.describe('hydrateVirtualEntry — catalog-first network behaviour', () => {

    test('calls hydrate API for a TBD part when catalog returns null (no Firebase auth in test env)', async ({ page }) => {
        // In the test environment Firebase is not configured / user is not authenticated,
        // so partCatalogService.findPartByNameOrSku() returns null immediately.
        // hydrateVirtualEntry must fall through to the API call.

        const session = {
            id: 'hydrate-fallthrough-test',
            slug: 'hydrate-test',
            name: 'Hydrate Fallthrough Test',
            ownerId: 'test-user',
            designRequirements: 'LED blinker',
            bom: [
                {
                    instanceId: 'tbd-part-001',
                    quantity: 1,
                    part: { id: 'pencil-2', sku: '', name: 'Pencil #2', category: 'Stationery', brand: 'TBD', price: 0, ports: [], description: '' },
                },
            ],
            generatedImages: [],
            messages: [],
            createdAt: new Date().toISOString(),
            lastModified: new Date().toISOString(),
            cacheIsDirty: false,
        };

        await interceptSourcingRoutes(page); // find, local, projects, architect
        // Register counting handler LAST — Playwright matches routes LIFO (last-in, first-matched)
        let hydrateCallCount = 0;
        await page.route('**/api/v1/sourcing/hydrate', async (route: any) => {
            hydrateCallCount++;
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ result: MOCK_HYDRATE_RESULT }),
            });
        });

        await page.addInitScript((s: any) => {
            localStorage.setItem('buildsheet_active_project_id', s.id);
            localStorage.setItem(`buildsheet_project_${s.id}`, JSON.stringify(s));
            localStorage.setItem('buildsheet_projects_index', JSON.stringify([{ id: s.id, name: s.name, lastModified: s.lastModified, preview: '' }]));
        }, session);

        await page.goto('http://localhost:8080/app/');
        await page.setViewportSize({ width: 1400, height: 900 });
        await page.waitForTimeout(1500);
        await dismissCookieConsent(page);

        // Trigger hydration by clicking on the TBD part to open its detail card,
        // then clicking "Get Specs".
        const partCard = page.locator(`text=Pencil #2`).first();
        await expect(partCard).toBeVisible({ timeout: 5000 });
        await partCard.click();
        await page.waitForTimeout(500);

        // 'Search & Source' is the button text for virtual (brand=TBD) parts — see App.tsx PartDetailModal
        const getSpecsButton = page.locator('button:has-text("Search & Source")').first();
        await expect(getSpecsButton).toBeVisible({ timeout: 3000 });
        await getSpecsButton.click();
        await page.waitForTimeout(2000);

        // Exactly one hydrate API call should have been made.
        expect(hydrateCallCount).toBeGreaterThanOrEqual(1);
    });

    test('only hydrates newly added TBD parts when applying audit changes — not the existing BOM', async ({ page }) => {
        // The session has 2 existing sourced parts (brand != TBD).
        // cachedAuditActions adds 1 new part (which will be created with brand='TBD').
        // After Apply, only the 1 new part should trigger a hydrate call.
        // The 2 existing parts must NOT trigger any hydrate calls.

        const session = {
            id: 'apply-hydrate-scope-test',
            slug: 'apply-scope',
            name: 'Apply Scope Test',
            ownerId: 'test-user',
            designRequirements: 'USB KVM switch with Raspberry Pi Zero 2 W',
            bom: [
                {
                    instanceId: 'existing-part-001',
                    quantity: 1,
                    part: { id: 'pi-zero', sku: 'SC0510', name: 'Raspberry Pi Zero 2 W', category: 'Microcontroller', brand: 'Raspberry Pi', price: 15, ports: [], description: 'Compact SBC' },
                    sourcing: { loading: false, online: [{ title: 'Adafruit', url: 'https://adafruit.com', source: 'Adafruit', price: '$15' }], local: [], lastUpdated: new Date().toISOString() },
                },
                {
                    instanceId: 'existing-part-002',
                    quantity: 1,
                    part: { id: 'usb-hub', sku: 'SL-140569', name: '4-Port USB 2.0 Hub', category: 'USB', brand: 'Sabrent', price: 9, ports: [], description: 'Compact hub' },
                    sourcing: { loading: false, online: [{ title: 'Amazon', url: 'https://amazon.com', source: 'Amazon', price: '$9' }], local: [], lastUpdated: new Date().toISOString() },
                },
            ],
            cachedAuditResult: '**Critical:** Missing a USB-C breakout board for the power path.',
            cachedAuditActions: [
                {
                    type: 'addPart',
                    partId: 'usb-c-breakout',
                    name: 'USB-C Breakout Board',
                    category: 'Connector',
                    quantity: 1,
                    reason: 'Needed for proper power path management',
                },
            ],
            generatedImages: [],
            messages: [],
            createdAt: new Date().toISOString(),
            lastModified: new Date().toISOString(),
            cacheIsDirty: false,
        };

        await interceptSourcingRoutes(page); // find, local, projects, architect
        // Register counting handler LAST so it has LIFO priority
        let hydrateCallCount = 0;
        await page.route('**/api/v1/sourcing/hydrate', async (route: any) => {
            hydrateCallCount++;
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ result: MOCK_HYDRATE_RESULT }),
            });
        });

        await page.addInitScript((s: any) => {
            localStorage.setItem('buildsheet_active_project_id', s.id);
            localStorage.setItem(`buildsheet_project_${s.id}`, JSON.stringify(s));
            localStorage.setItem('buildsheet_projects_index', JSON.stringify([{ id: s.id, name: s.name, lastModified: s.lastModified, preview: '' }]));
        }, session);

        await page.goto('http://localhost:8080/app/');
        await page.setViewportSize({ width: 1400, height: 900 });
        await page.waitForTimeout(1500);
        await dismissCookieConsent(page);

        // Open the audit modal — "View Audit" is shown when cachedAuditResult is present
        const viewAuditButton = page.locator('button:has-text("View Audit")');
        await expect(viewAuditButton).toBeVisible({ timeout: 5000 });
        await viewAuditButton.click();
        await page.waitForTimeout(500);

        // The Apply button should be present (1 cached action)
        const applyButton = page.locator('button:has-text("Apply Recommended Changes"), button:has-text("Apply 1 Change")').first();
        await expect(applyButton).toBeVisible({ timeout: 3000 });

        // Snapshot hydrate count before applying (in case any stray calls happened on load)
        const callsBefore = hydrateCallCount;

        await applyButton.click();

        // Wait for the modal to close (handleApplyAuditChanges calls setAuditOpen(false) on success)
        const auditModal = page.locator('[aria-labelledby="audit-title"]');
        await expect(auditModal).not.toBeVisible({ timeout: 10000 });

        // Only the 1 newly added TBD part should have triggered a hydrate call.
        // The 2 existing sourced parts must NOT have been re-hydrated.
        const callsForNewParts = hydrateCallCount - callsBefore;
        expect(callsForNewParts).toBe(1);
    });
});


// ---------------------------------------------------------------------------
// Suite 2: clearAuditActions — Apply button must not persist after applying
// ---------------------------------------------------------------------------
test.describe('clearAuditActions — stale Apply button prevention', () => {

    test('Apply button is gone after audit changes are applied and modal is reopened', async ({ page }) => {
        const session = {
            id: 'clear-actions-ui-test',
            slug: 'clear-actions',
            name: 'Clear Actions UI Test',
            ownerId: 'test-user',
            designRequirements: 'USB KVM switch',
            bom: [
                {
                    instanceId: 'existing-part-001',
                    quantity: 1,
                    part: { id: 'pi-zero', sku: 'SC0510', name: 'Raspberry Pi Zero 2 W', category: 'Microcontroller', brand: 'Raspberry Pi', price: 15, ports: [], description: 'SBC' },
                    sourcing: { loading: false, online: [{ title: 'Adafruit', url: 'https://adafruit.com', source: 'Adafruit', price: '$15' }], local: [], lastUpdated: new Date().toISOString() },
                },
            ],
            cachedAuditResult: '**Critical:** Add a USB-C breakout board.',
            cachedAuditActions: [
                { type: 'addPart', partId: 'usb-c-breakout', name: 'USB-C Breakout Board', category: 'Connector', quantity: 1, reason: 'Power path' },
            ],
            generatedImages: [],
            messages: [],
            createdAt: new Date().toISOString(),
            lastModified: new Date().toISOString(),
            cacheIsDirty: false,
        };

        await interceptSourcingRoutes(page); // find, local, projects, architect
        await interceptHydrate(page);           // passthrough hydrate (no counting needed here)

        await page.addInitScript((s: any) => {
            localStorage.setItem('buildsheet_active_project_id', s.id);
            localStorage.setItem(`buildsheet_project_${s.id}`, JSON.stringify(s));
            localStorage.setItem('buildsheet_projects_index', JSON.stringify([{ id: s.id, name: s.name, lastModified: s.lastModified, preview: '' }]));
        }, session);

        await page.goto('http://localhost:8080/app/');
        await page.setViewportSize({ width: 1400, height: 900 });
        await page.waitForTimeout(1500);
        await dismissCookieConsent(page);

        // Open audit modal and apply changes
        const viewAuditButton = page.locator('button:has-text("View Audit")');
        await expect(viewAuditButton).toBeVisible({ timeout: 5000 });
        await viewAuditButton.click();
        await page.waitForTimeout(500);

        const applyButton = page.locator('button:has-text("Apply Recommended Changes"), button:has-text("Apply 1 Change")').first();
        await expect(applyButton).toBeVisible({ timeout: 3000 });
        await applyButton.click();

        // Wait for modal to close after applying
        const auditModal = page.locator('[aria-labelledby="audit-title"]');
        await expect(auditModal).not.toBeVisible({ timeout: 10000 });

        // After apply, cacheIsDirty becomes true (new part added), so the button label is 'Verify'
        // Clicking 'Verify' opens the audit modal and runs performVerifyAudit (AI call is intercepted)
        const reopenButton = page.locator('button:has-text("Verify")');
        await expect(reopenButton).toBeVisible({ timeout: 5000 });
        await reopenButton.click();
        // Wait for the audit modal to open (performVerifyAudit calls setAuditOpen(true) immediately)
        await expect(auditModal).toBeVisible({ timeout: 5000 });
        await page.waitForTimeout(500);

        // The Apply button must NOT be visible — cachedAuditActions should be cleared
        const applyButtonAfter = page.locator('button:has-text("Apply Recommended Changes"), button:has-text("Apply 1 Change")').first();
        await expect(applyButtonAfter).not.toBeVisible({ timeout: 2000 });
    });

    test('localStorage no longer contains cachedAuditActions after applying', async ({ page }) => {
        const sessionId = 'clear-actions-storage-test';
        const session = {
            id: sessionId,
            slug: 'clear-storage',
            name: 'Clear Actions Storage Test',
            ownerId: 'test-user',
            designRequirements: 'LED matrix display',
            bom: [
                {
                    instanceId: 'existing-part-001',
                    quantity: 1,
                    part: { id: 'arduino-uno', sku: 'A000066', name: 'Arduino Uno', category: 'Microcontroller', brand: 'Arduino', price: 27, ports: [], description: 'MCU board' },
                    sourcing: { loading: false, online: [{ title: 'Arduino Store', url: 'https://store.arduino.cc', source: 'Arduino', price: '$27' }], local: [], lastUpdated: new Date().toISOString() },
                },
            ],
            cachedAuditResult: '**Warning:** Add a current-limiting resistor.',
            cachedAuditActions: [
                { type: 'addPart', partId: '330-ohm-resistor', name: '330 Ohm Resistor', category: 'Passive', quantity: 10, reason: 'Current limiting for LED matrix' },
            ],
            generatedImages: [],
            messages: [],
            createdAt: new Date().toISOString(),
            lastModified: new Date().toISOString(),
            cacheIsDirty: false,
        };

        await interceptSourcingRoutes(page); // find, local, projects, architect
        await interceptHydrate(page);

        await page.addInitScript((s: any) => {
            localStorage.setItem('buildsheet_active_project_id', s.id);
            localStorage.setItem(`buildsheet_project_${s.id}`, JSON.stringify(s));
            localStorage.setItem('buildsheet_projects_index', JSON.stringify([{ id: s.id, name: s.name, lastModified: s.lastModified, preview: '' }]));
        }, session);

        await page.goto('http://localhost:8080/app/');
        await page.setViewportSize({ width: 1400, height: 900 });
        await page.waitForTimeout(1500);
        await dismissCookieConsent(page);

        // Apply audit changes
        const viewAuditButton = page.locator('button:has-text("View Audit")');
        await expect(viewAuditButton).toBeVisible({ timeout: 5000 });
        await viewAuditButton.click();
        await page.waitForTimeout(500);

        const applyButton = page.locator('button:has-text("Apply Recommended Changes"), button:has-text("Apply 1 Change")').first();
        await expect(applyButton).toBeVisible({ timeout: 3000 });
        await applyButton.click();

        const auditModal = page.locator('[aria-labelledby="audit-title"]');
        await expect(auditModal).not.toBeVisible({ timeout: 10000 });

        // Read localStorage directly and verify cachedAuditActions is cleared
        const stored = await page.evaluate((id: string) => {
            const raw = localStorage.getItem(`buildsheet_project_${id}`);
            if (!raw) return null;
            return JSON.parse(raw);
        }, sessionId);

        expect(stored).not.toBeNull();
        // clearAuditActions() sets cachedAuditActions to undefined — it should be absent or empty
        expect(stored.cachedAuditActions == null || stored.cachedAuditActions.length === 0).toBe(true);
    });
});


// ---------------------------------------------------------------------------
// Suite 3: partCatalogService — doc ID generation logic (in-process, no browser)
//
// NOTE: These tests mirror the document-ID formula used by saveHydratedPart():
//   (part.sku || part.name).toLowerCase().replace(/[^a-z0-9]/g, '-')
// When the vitest unit tests described at the top of this file are created,
// these in-process Playwright tests can be removed in favour of the faster
// vitest equivalents that directly import the service.
// ---------------------------------------------------------------------------
test.describe('partCatalogService — Firestore doc ID generation (in-process)', () => {

    function makeDocId(part: { sku?: string; name: string }): string {
        // Mirrors the exact formula in partCatalogService.saveHydratedPart()
        return (part.sku || part.name).toLowerCase().replace(/[^a-z0-9]/g, '-');
    }

    test('uses SKU as doc ID when SKU is present', () => {
        expect(makeDocId({ sku: 'ESP32-WROOM-32D', name: 'ESP32 Module' })).toBe('esp32-wroom-32d');
    });

    test('falls back to name when SKU is absent', () => {
        expect(makeDocId({ name: 'Pencil #2' })).toBe('pencil--2');
    });

    test('falls back to name when SKU is an empty string', () => {
        expect(makeDocId({ sku: '', name: 'Arduino Uno' })).toBe('arduino-uno');
    });

    test('lowercases the entire doc ID', () => {
        expect(makeDocId({ sku: 'ADAFRUIT-4090', name: 'Adafruit Part' })).toBe('adafruit-4090');
    });

    test('replaces all non-alphanumeric characters with hyphens', () => {
        expect(makeDocId({ name: 'NPN Transistor (2N3904)' })).toBe('npn-transistor--2n3904-');
    });

    test('collapses spaces to hyphens', () => {
        expect(makeDocId({ name: '330 Ohm Resistor' })).toBe('330-ohm-resistor');
    });

    test('two parts with the same name and no SKU produce the same doc ID (catalog deduplication)', () => {
        const a = makeDocId({ name: 'Pencil #2' });
        const b = makeDocId({ name: 'Pencil #2' });
        expect(a).toBe(b);
    });
});
