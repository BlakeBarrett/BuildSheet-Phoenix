
import { test, expect } from '@playwright/test';

test('visualizer takes up 40% of viewport height', async ({ page }) => {
    // 1. Navigate to the app
    try {
        await page.goto('http://localhost:3000', { timeout: 5000 });
    } catch (error) {
        test.skip(true, 'Dev server not running on localhost:3000');
        return;
    }

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
    const visualizerComponent = page.getByText('Nano Banana').first();
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
