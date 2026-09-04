import { test, expect } from '@playwright/test';

/**
 * ArchitectCorrectionDialog — end-to-end coverage of the user-correction flow.
 *
 * The dialog is reachable from the assistant-message hover toolbar (flag
 * icon) in the live chat feed. A full project session (including one
 * assistant message) is seeded into localStorage so these tests need no
 * LLM/Firebase round-trip, and the /architect/correct endpoint is mocked to
 * capture the submitted payload.
 *
 * Coverage:
 *   1. the entry point actually opens the dialog (the original spec only
 *      asserted a JS bundle existed and could never fail),
 *   2. required-field validation,
 *   3. submission payload shape: backend-valid category enum, evidence in
 *      its own field, and NO client-controlled `source` key.
 */

const PROJECT_ID = 'e2e-correction-project';

const seedSession = {
  id: PROJECT_ID,
  slug: PROJECT_ID,
  ownerId: 'e2e-user',
  name: 'Correction Flow Test',
  designRequirements: 'LED blinker with current limiting resistor',
  bom: [],
  generatedImages: [],
  messages: [
    {
      role: 'assistant',
      content: 'Your LED blinker circuit is complete: an ATmega328P drives an LED through a 220 ohm resistor.',
      timestamp: new Date().toISOString(),
    },
  ],
  createdAt: new Date().toISOString(),
  lastModified: new Date().toISOString(),
};

const seedIndex = [
  {
    id: PROJECT_ID,
    name: seedSession.name,
    lastModified: seedSession.lastModified,
    preview: 'Empty Draft',
    archived: false,
  },
];

test.describe('ArchitectCorrectionDialog', () => {
  let captured: Array<{ body: any }>;

  test.beforeEach(async ({ page }) => {
    captured = [];

    await page.addInitScript(({ pid, session, index }: any) => {
      localStorage.setItem('buildsheet_consent', 'full');
      localStorage.setItem('buildsheet_project_' + pid, JSON.stringify(session));
      localStorage.setItem('buildsheet_projects_index', JSON.stringify(index));
      localStorage.setItem('buildsheet_active_project_id', pid);
    }, { pid: PROJECT_ID, session: seedSession, index: seedIndex });

    // Capture correction submissions against the container API.
    await page.route('**/api/v1/architect/correct', async route => {
      captured.push({ body: route.request().postDataJSON() });
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Correction submitted for review', factId: 'fact-e2e', status: 'pending' }),
      });
    });

    await page.goto('/app/');
  });

  async function openDialog(page: import('@playwright/test').Page) {
    const feed = page.getByRole('log');
    await expect(feed.getByText(/LED blinker circuit is complete/i)).toBeVisible();
    const group = feed.locator('.group', { hasText: 'LED blinker circuit is complete' }).first();
    await group.hover();
    const flag = group.getByTitle(/report inaccuracy/i);
    await flag.click();
    return page.getByRole('dialog', { name: /report inaccurate information/i });
  }

  test('opens from the assistant-message flag action', async ({ page }) => {
    const dialog = await openDialog(page);
    await expect(dialog).toBeVisible();
    await expect(dialog.locator('#correction-category')).toBeVisible();
  });

  test('validates required fields before submission', async ({ page }) => {
    const dialog = await openDialog(page);
    await dialog.getByRole('button', { name: /submit correction/i }).click();
    await expect(dialog.getByText(/fill in the category/i)).toBeVisible();
    expect(captured).toHaveLength(0);
  });

  test('submits a backend-shaped payload without a client-controlled source', async ({ page }) => {
    const dialog = await openDialog(page);

    // Category values MUST be from the backend allowlist.
    const options = await dialog.locator('#correction-category option').allTextContents();
    expect(options.join(' ')).toContain('Component Specs');

    await dialog.locator('#correction-category').selectOption('component-specs');
    await dialog.locator('#correction-text').fill('The resistor should be 220 ohms, not 330.');
    await dialog.locator('#correction-evidence').fill('ATmega328P datasheet, section 13');
    await dialog.getByRole('button', { name: /submit correction/i }).click();

    await expect(dialog.getByText(/thank you/i)).toBeVisible();
    expect(captured).toHaveLength(1);
    expect(captured[0].body.category).toBe('component-specs');
    expect(captured[0].body.statement).toContain('220 ohms');
    expect(captured[0].body.evidence).toBe('ATmega328P datasheet, section 13');
    // `source` is server-controlled provenance — never sent by the client.
    expect(captured[0].body.source).toBeUndefined();
  });
});
