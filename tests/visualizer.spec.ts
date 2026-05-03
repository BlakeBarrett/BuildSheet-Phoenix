
import { test, expect } from '@playwright/test';

test('visualizer takes up 40% of viewport height', async ({ page }) => {
    // 1. Navigate to the app
    await page.goto('http://localhost:3000');

    // 2. Wait for the visualizer container to be visible
    // Based on App.tsx, the visualizer is in a div with "Hero Visualizer" comment above it.
    // We can select it by its structure or by finding the ChiltonVisualizer inside it.
    // The container has classes: "px-4 pb-2 h-[40%] shrink-0"
    // Let's use a locator that finds the ChiltonVisualizer and gets its parent.
    // Or better, let's add a data-testid to the App.tsx for stability, but for now I will rely on the class or hierarchy.
    // The ChiltonVisualizer has text "Gemini Nano" or "Main Viewport".

    // Let's target the container directly if possible, or the element that *should* be 40%.
    // In App.tsx: 
    // <div className="px-4 pb-2 h-[40%] shrink-0">
    //    <ChiltonVisualizer ... />
    // </div>

    // We can find the ChiltonVisualizer text "Gemini Nano" or "Blank Canvas" and go up to the container.
    const visualizerComponent = page.locator('[data-testid="visualizer-root"], .ChiltonVisualizer, div.h-full.w-full.flex').first();
    await expect(visualizerComponent).toBeVisible();

    // The ChiltonVisualizer renders a div with "h-full w-full".
    // The *container* in App.tsx sets the height.
    // Let's find the container. 
    // We can look for the div that *contains* the ChiltonVisualizer text and has the 'h-[40%]' class (or we can just measure the visualizer itself since it fills the container).

    // Steps:
    // 1. Get the viewport size.
    const viewportSize = page.viewportSize();
    expect(viewportSize).not.toBeNull();
    const viewportHeight = viewportSize!.height;

    // 2. Get the bounding box of the visualizer's OUTER container (or the visualizer itself which fills it).
    // The ChiltonVisualizer root div is "h-full w-full". 
    // So measuring the ChiltonVisualizer root element should give us the height of the container.
    // The ChiltonVisualizer usually has "Gemini Nano" chip inside it.
    // Let's get the element that contains "Gemini Nano" header, then go up to the root of ChiltonVisualizer.
    // Actually, ChiltonVisualizer root is: <div className="h-full w-full flex flex-col md:flex-row gap-3">

    // Let's try locating by a stable selector. 
    // I will assume the "Blank Canvas" text is present initially since no BOM is loaded.
    const visualizerRoot = page.locator('div.h-full.w-full.flex.flex-col.md\\:flex-row.gap-3').first();
    await expect(visualizerRoot).toBeVisible();

    const box = await visualizerRoot.boundingBox();
    expect(box).not.toBeNull();
    const visualizerHeight = box!.height;

    // 3. Calculate percentage
    const percentage = visualizerHeight / viewportHeight;
    console.log(`Viewport Height: ${viewportHeight}, Visualizer Height: ${visualizerHeight}, Percentage: ${percentage}`);

    // 4. Assert. 40% is 0.4. allow some tolerance (e.g. +/- 2% due to padding/margins/borders if any, though h-[40%] should be precise in a flex container if nothing else eats it, but standard layout might have some minor diffs).
    // Note: The container is h-[40%] of the *parent*. The parent is "flex-1 flex overflow-hidden...". 
    // The parent is in <main> which is "flex-1 ... h-full".
    // The <main> is inside top-level div "h-[100dvh]".
    // So 40% of the parent *should* be roughly 40% of the viewport, minus the header/footer of the main pane if any.
    // Wait, the visualizer is *inside* "PANE 1: DRAFTING TABLE".
    // Pane 1 has a Header (h-auto), the Visualizer (h-[40%]), Conversation Feed (flex-1), Footer (h-auto).
    // Actually, `h-[40%]` on a flex child without `flex-basis` or explicit height on parent might behave differently depending on Flexbox rules, but usually `h-[40%]` means 40% of the parent's content box height.
    // The parent is "PANE 1" which is `flex-col h-full`.
    // PANE 1 is child of `<main>` which is `flex-1 ... h-full`.
    // `<main>` is child of App container `h-[100dvh]`.
    // So PANE 1 is effectively full height (minus padding).
    // Therefore, Visualizer should be roughly 40% of the Pane height.
    // And Pane height is roughly Viewport height (minus global padding).

    // Let's verifying it is APPROXIMATELY 40% of the VIEWPORT (since the user asked for "40% of the available vertical space").
    // If "available vertical space" means the *window*, then it should be ~40% of window.
    // If it means "Space in the card", it's 40% of the card.
    // Given the implementation `h-[40%]`, it is 40% of the containing block (the card).
    // The card is roughly 100% of the screen.
    // So it should be roughly 40% of screen.

    expect(percentage).toBeCloseTo(0.4, 1); // allowing 0.1 difference (30%-50%) just to be safe first run, then refine.
    // Actually, checking if it is *significantly larger* than the old fixed 240px is a good check too.
    // 40% of 1080p is ~430px. 40% of 768p is ~300px.
    // The old fixed was 240px. 

    // Let's refine the assertion:
    // It should be > 260px (the old max fixed height) on a standard desktop size.
    if (viewportHeight > 800) {
        expect(visualizerHeight).toBeGreaterThan(300);
    }
});

// ---------------------------------------------------------------------------
// performVisualGeneration — prompt construction
//
// Verifies that when a BOM is loaded, clicking "New" sends a rich prompt
// containing the project name and component names, not a bare fallback.
// ---------------------------------------------------------------------------

test('performVisualGeneration builds BOM-rich prompt from session', async ({ page }) => {
    const sessionId = 'vis-prompt-test';
    const mockSession = {
        id: sessionId,
        slug: sessionId,
        ownerId: '',
        name: 'LED Wristwatch',
        designRequirements: '',
        bom: [
            { instanceId: 'i1', quantity: 1, isCompatible: true,
              part: { id: 'mcu-1', sku: '', name: 'ATtiny85 MCU', category: 'Microcontroller', brand: '', price: 0, ports: [], description: '' } },
            { instanceId: 'i2', quantity: 4, isCompatible: true,
              part: { id: 'led-1', sku: '', name: '3mm Red LED', category: 'LED', brand: '', price: 0, ports: [], description: '' } },
            { instanceId: 'i3', quantity: 1, isCompatible: true,
              part: { id: 'bat-1', sku: '', name: 'CR2032 Battery', category: 'Power', brand: '', price: 0, ports: [], description: '' } },
        ],
        generatedImages: [],
        messages: [],
        createdAt: new Date().toISOString(),
        lastModified: new Date().toISOString(),
        cacheIsDirty: false,
    };

    // Intercept the image generation request before it hits the Vite proxy
    let capturedBody: any = null;
    await page.route('**/dashscope-image/**', async route => {
        capturedBody = JSON.parse(route.request().postData() || '{}');
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ output: { task_id: 'mock-task', task_status: 'PENDING' } }),
        });
    });

    // Pre-load the session into localStorage before the app boots
    await page.addInitScript(({ id, session }) => {
        localStorage.setItem('buildsheet_active_project_id', id);
        localStorage.setItem(`buildsheet_project_${id}`, JSON.stringify(session));
        localStorage.setItem('buildsheet_projects_index', JSON.stringify(
            [{ id, name: session.name, lastModified: session.lastModified, preview: '' }]
        ));
    }, { id: sessionId, session: mockSession });

    await page.goto('http://localhost:3000');
    await page.setViewportSize({ width: 1400, height: 900 });
    await page.waitForTimeout(800);

    // Dismiss cookie consent if present
    const acceptAll = page.locator('button:has-text("Accept All")');
    if (await acceptAll.isVisible({ timeout: 2000 }).catch(() => false)) {
        await acceptAll.click();
        await page.waitForTimeout(300);
    }

    // Click the "New" generate button in the visualizer gallery strip
    const newImageBtn = page.locator('button.border-dashed').first();
    await expect(newImageBtn).toBeEnabled({ timeout: 5000 });
    await newImageBtn.click();

    // Wait for the intercepted request
    await page.waitForTimeout(500);

    expect(capturedBody).not.toBeNull();
    const promptText: string = capturedBody?.input?.messages?.[0]?.content?.[0]?.text ?? '';

    // Should include project name and component names
    expect(promptText).toContain('LED Wristwatch');
    expect(promptText).toContain('ATtiny85 MCU');
    expect(promptText).toContain('3mm Red LED');
    expect(promptText).toContain('CR2032 Battery');
    // Should NOT be a bare fallback string
    expect(promptText).not.toBe('LED Wristwatch');
    expect(promptText).toContain('Technical product visualization');
});
