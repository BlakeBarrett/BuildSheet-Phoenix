# BuildSheet — ui-refresh TODO

> **Branch: `ui-refresh`** — never commit to `dev`.
> Every code change requires a Docker rebuild: `docker build --no-cache --load && docker-compose up -d`
> Test command: `npx playwright test` (179 total: 164 original + 20 accessibility)
> App URL: `http://localhost:8080/app/`

---

## BLOCK 1 — Critical Accessibility Fixes (8 failing tests, must fix first)

### 1.1 Sidebar Icon Contrast (test 1 failing)
**File:** `components/Material3UI.tsx` (IconButton) + App.tsx (sidebar usage)
**Problem:** Sidebar icon buttons render icon names as visible textContent. The icon span is `material-symbols-rounded` text (e.g. "build", "chat_bubble_outline") displayed in light color against dark/navy background, failing 4.5:1 contrast.
**Fix:**
- Ensure all `IconButton` icon `<span>` elements have `aria-hidden="true"` (already done at line 138)
- Verify the sidebar button text isn't leaking icon names — the icon text should NOT be visible in the DOM text content
- If icon text is visible on page, the Material Icons font is rendering the unicode glyph but the alt text is also showing — check that `data-icon` attribute isn't duplicating the text content
- Test with `browser_console` expression: `document.querySelectorAll('button').forEach(b => console.log(b.textContent, b.tagName))`
**Verify:** Contrast test passes + sidebar still looks visually correct
**Test:** `tests/accessibility.spec.ts:4`

### 1.2 Chat Bubble Icon Contrast (test 2 failing)
**File:** `App.tsx` (chat bubble / empty state area)
**Problem:** The robot/robot icon inside `[role="log"]` has insufficient contrast against its background.
**Fix:**
- Find the icon element in the empty chat area
- Increase contrast: either darken the icon color or lighten the background
- Likely need to change `text-slate-400` or similar to `text-slate-600` or `text-indigo-400`
**Verify:** Icon is still visually visible and aesthetically appropriate
**Test:** `tests/accessibility.spec.ts:49`

### 1.3 Icon Name Leaks into Button textContent (test 3 failing)
**File:** `components/Material3UI.tsx` (IconButton) + `App.tsx` (where IconButton is used)
**Problem:** The `<span data-icon="build">build</span>` renders the word "build" as visible text in some contexts, making button textContent = "build NEW" or similar, leaking the icon name.
**Fix:**
- In `Material3UI.tsx` IconButton, the `<span>` contains the icon name text. It should be hidden.
- The `data-icon` attribute is for CSS styling only — the text content of the span IS the visible text
- Fix: set the span content to empty `><` and rely on `data-icon` + CSS `::before { content: attr(data-icon) }` — OR change the approach so the icon text is inside a pseudo-element or `aria-hidden` span that doesn't contribute to textContent
- Simplest fix: `><` the span text to be the actual Material Icon unicode character or ensure the span has `style="font-family: 'Material Symbols Rounded'"` and the text content is hidden via `text-indent` or similar
- Actually the cleanest approach: `<span aria-hidden="true" style="font-variation-settings: 'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24">{icon}</span>` — but this still has the text in the DOM. Better: use `content: attr(data-icon)` with CSS.
- **Easiest fix:** Change the `<span>` from `{icon}` to `` (empty), and in CSS define: `span[data-icon]::before { content: attr(data-icon); font-family: 'Material Symbols Rounded'; }`
- Wait — simpler: the Material Icons webfont renders the text content AS the icon glyph. The text "build" IS rendered as the wrench icon visually. But screen readers and `textContent` still see the word "build". The fix is to make the span's text truly invisible (not just aria-hidden) by using a CSS approach.
- **Approach A:** `<span style="font-family: 'Material Symbols Rounded'; text-rendering: optimizeLegibility; -webkit-font-smoothing: antialiased;" aria-hidden="true">{icon}</span>` — this is what we have. The issue is that `textContent` returns "build" even though it's visually an icon. The fix is to use CSS to replace the text:
  ```css
  span[data-icon]::before { content: attr(data-icon); }
  span[data-icon] { visibility: hidden; }
  span[data-icon]::before { visibility: visible; }
  ```
  Or: `<span aria-hidden="true" className="material-symbols-rounded" data-icon={icon}></span>` with CSS `::before { content: attr(data-icon); font-family: 'Material Symbols Rounded'; }`
- **Approach B (simplest):** Set the span content to the actual unicode character instead of the icon name. But that requires a mapping. Not practical.
- **Approach C:** Use CSS `visibility: hidden` on the text span and `::before` pseudo-element for rendering:
  ```jsx
  <span className="material-symbols-icon" aria-hidden="true" data-icon={icon}></span>
  ```
  With CSS:
  ```css
  .material-symbols-icon {
    font-family: 'Material Symbols Rounded';
    visibility: hidden;
  }
  .material-symbols-icon::before {
    visibility: visible;
    content: attr(data-icon);
  }
  ```
- This makes the span's `textContent` return empty string, so button textContent no longer includes icon names.
**Verify:** All buttons that previously had icon name leaks now have clean textContent
**Test:** `tests/accessibility.spec.ts:128`

### 1.4 Button aria-label doesn't match clean text (test 4 failing)
**File:** `components/Material3UI.tsx` (IconButton)
**Problem:** After fixing 1.3, the icon span's textContent will be empty, but the button's `aria-label` still falls back to `icon.replace(/_/g, ' ')` (e.g. "add photo alternate"). The test checks that `aria-label` matches the clean visible text.
**Fix:**
- The IconButton `aria-label={title || icon.replace(/_/g, ' ')}` is actually correct for icon-only buttons
- The issue is the test regex `/^[a-z_]+\s+\S+/` still matches because the visible text (children) of the button includes icon names
- After fixing 1.3 (icon span has empty textContent), this test should also pass automatically
- If `title` prop is passed, use it. If not, the aria-label with spaces is fine — the test allows `ariaLabel !== stripped && ariaLabel !== visibleText`
- Make sure the IconButton always receives a `title` prop from its call sites, or ensure the aria-label is a proper accessible name like "New Project" instead of "add photo alternate"
**Verify:** All buttons have meaningful aria-labels
**Test:** `tests/accessibility.spec.ts:155`

### 1.5 Touch Targets Under 44px (test 5 failing)
**File:** `components/Material3UI.tsx` (Chip, IconButton) + App.tsx (mobile layout)
**Problem:** At 375px viewport (iPhone SE size), several interactive elements are smaller than 44x44px.
**Fix:**
- `IconButton` is `w-12 h-12` (48x48px) — this passes at 375px width if it's not nested in a narrow container
- `Chip` is `h-8 px-3` (32px height × ~48px width) — this FAILS because height is only 32px (h-8 = 2rem = 32px). Need at least 44px
- The Chip component needs `min-h-[44px]` or `h-11` (44px) for the touch target
- Any icon-only elements in the mobile tab bar or sidebar also need checking
- In the mobile view, the bottom tab bar icons (`lg:hidden`) may be too small
- Check: are sidebar icons at narrow widths rendered as smaller touch targets?
**Verify:** All interactive elements are >= 44x44px at 375px viewport width
**Test:** `tests/accessibility.spec.ts:233`

### 1.6 Heading Hierarchy (test 6 failing)
**File:** `App.tsx`
**Problem:** No `<h1>` element exists on the page. The project title uses `<h3>` and section headers use `<h4>`. Heading hierarchy is broken (skips h1 and h2).
**Fix:**
- Find the project title element (currently `<h3>` with class "text-2xl font-bold tracking-tight")
- Change it to `<h1>` with the same styling classes
- Find section headers and adjust: if they're `<h4>`, change to `<h2>` (since h1 is used for the title, h2 for section, h3 for subsection)
- Look for all heading elements in App.tsx and renumber:
  - Project title: `h3` -> `h1`
  - Section headers (e.g., "Bill of Materials", "Draft", "Estimate"): `h4` -> `h2`
  - Subsection headers: `h5`/`h6` -> `h3`
**Verify:** Heading hierarchy is h1 -> h2 -> h3 (no skipping)
**Test:** `tests/accessibility.spec.ts:282`

### 1.7 Server Connection Indicator (test 7 failing)
**File:** `App.tsx` (main app layout) + new component `components/ServerStatusIndicator.tsx`
**Problem:** No visual indicator shows when the backend AI server is unreachable. Users see silent failures.
**Fix:**
- Create a small status indicator component that monitors server connectivity
- The app already has API calls that can fail. Add a status check at app startup and periodically (e.g., every 30 seconds)
- When server is unreachable, show a subtle banner at the top: "AI service temporarily unavailable" with a retry button
- Use the existing API client's error handling to detect server issues
- Implementation: Add a `useServerHealth()` hook that polls a lightweight endpoint (e.g., `/api/health` or attempts a simple fetch) and returns `connected: boolean`
- When `!connected`, render a top banner in the existing nav area
- Style: subtle yellow/amber banner (`bg-amber-50 border-b border-amber-200`), small text, closeable
**Verify:** Banner appears when server is down, dismisses when server is back
**Test:** `tests/accessibility.spec.ts:397` (checks for elements with class containing "connection", "status", "online", "offline", or "server")

### 1.8 Privacy Disclaimer Contrast (test 8 failing)
**File:** `App.tsx` (footer/disclaimer text)
**Problem:** Disclaimer text uses `text-slate-400` which has ~2.56:1 contrast against white background, failing WCAG AA for normal text (needs 4.5:1).
**Fix:**
- Find the disclaimer `<p>` element containing "draft-quality" or "verify all"
- Change `text-slate-400` to `text-slate-500` (contrast ~3.8:1) or `text-slate-600` (contrast ~4.6:1 — passes AA)
- Recommended: `text-slate-500` if aesthetics matter, `text-slate-600` if passing the test is the priority
- Also check the text background — is it actually white or a different color? The test samples the computed background
**Verify:** Text is still readable and aesthetically appropriate (not too dark for a footer disclaimer)
**Test:** `tests/accessibility.spec.ts:443`

---

## BLOCK 2 — Usability Enhancements (visual, not test-covered)

### 2.1 Sidebar Icon Labels/Tooltips
**File:** `App.tsx` (sidebar nav section)
**Problem:** Icon-only navigation. Users must guess what wrench, plus, folder, dots, pencil icons mean.
**Fix:**
- Add `title` tooltips to each IconButton in the sidebar (e.g., `title="New Project"`, `title="Projects"`, `title="More tools"`, `title="Settings"`)
- This is already partially done via the `title` prop on IconButton (line 128: `title={title || icon}`)
- Ensure all sidebar IconButton calls in App.tsx pass descriptive `title` props
- For desktop, consider adding a hover-reveal text label next to icons
**Verify:** Hovering any sidebar icon shows a clear tooltip

### 2.2 Input Placeholder Clarity
**File:** `App.tsx` (textarea input)
**Problem:** "Instruct Gemini..." placeholder is vague. Users may not understand this is where they describe hardware projects.
**Fix:**
- Change placeholder to something more descriptive: "Describe your hardware project, ask for design suggestions, or paste a bill of materials..."
- This is the `placeholder` prop on the textarea
- Consider adding a helper text below the input: "Tip: Be specific about components, constraints, and goals"
**Verify:** Placeholder is clear and visible at normal font size

### 2.3 Empty State Example Prompts
**File:** `App.tsx` (chat bubble / empty state area)
**Problem:** The sample prompt "Design a Raspberry Pi Zero 2W USB KVM switch..." is inside a gray speech bubble but easy to miss.
**Fix:**
- Make the example prompt more prominent: add a subtle "Try an example:" label above it
- Style the example prompts as clickable chips/buttons that auto-fill the textarea
- Add 3-4 diverse examples (not just Raspberry Pi): e.g., "Design a solar-powered USB charging station", "Convert my BOM to a manufacturing checklist"
**Verify:** Example prompts are visually distinct and clickable

### 2.4 Right Panel Mobile Access
**File:** `App.tsx` (responsive layout)
**Problem:** The right panel (estimation, actions) hides at `lg:hidden` but there's no way to access it on mobile.
**Fix:**
- Add a floating action button or bottom sheet toggle for mobile to reveal the estimation panel
- Alternatively, make the right panel slide in from the right on mobile with a hamburger/chevron button
- Consider merging key estimation info into the main panel on mobile (e.g., show total at top of page)
**Verify:** On 375px viewport, user can access estimation data

### 2.5 Action Button Visual Hierarchy
**File:** `App.tsx` (Verify/Plan buttons, Google Search Kit / Preferred Vendors)
**Problem:** "Google Search Kit" is prominent blue, "Preferred Vendors" is pale yellow with low contrast. "Verify" and "Plan" are gray and easily overlooked.
**Fix:**
- Standardize the chip/button colors: "Google Search Kit" (blue), "Preferred Vendors" (amber/orange, not pale yellow)
- Change "Preferred Vendors" from pale yellow to a more saturated amber/amber-500
- For "Verify" and "Plan": make "Verify" a primary action (indigo) and "Plan" a secondary action (tonal/outlined)
- Ensure all buttons have sufficient contrast
**Verify:** Primary actions stand out, secondary actions are clearly less prominent

---

## BLOCK 3 — Test Fixes (infrastructure)

### 3.1 Focus Management Tests
**Files:** `tests/accessibility.spec.ts` (tests 7-8)
**Problem:** Tests expect focus-visible ring on first Tab press. If no element receives focus on first Tab, test fails.
**Fix:**
- These tests may pass after fixing other issues if the textarea gets focus on Tab
- Verify the textarea has `tabindex="0"` (it should via being a form element)
- Check that focus-visible styles exist for all interactive elements
- The test at line 193 checks `outlineStyle !== 'none' || outlineWidth > 0 || boxShadow !== 'none'` — the CheckboxButton component or other custom elements might not have focus-visible styles
- Ensure all custom interactive elements (dual-thumb sliders, custom checkboxes) have `focus-visible:ring-2 focus-visible:ring-indigo-600 focus-visible:outline-none`
**Verify:** Pressing Tab shows visible focus ring on any focused element

### 3.2 Settings Modal Section Headers
**Files:** `components/SettingsModal.tsx`, `tests/accessibility.spec.ts` (test 12)
**Problem:** Settings modal dialog needs at least 2 section headers or 1 fieldset.
**Fix:**
- The test already passes (it's in the 12 passing tests), so this should be complete
- Verify SettingsModal has clear section headers (e.g., "AI Settings", "Preferences", "Privacy")
**Verify:** Settings dialog shows grouped sections with headers

---

## BLOCK 4 — Visual Audit Across Breakpoints

### 4.1 Desktop (1280×900+)
- [ ] Verify 3-column layout is balanced (left nav ~64px, center ~flex-1, right ~320px)
- [ ] Check that no content is clipped or horizontally scrollable
- [ ] Verify hover states on all buttons and chips
- [ ] Verify the AI response rendering (when messages appear) is readable

### 4.2 Tablet (768×1024)
- [ ] Verify the right panel collapse/merge behavior at `lg:` breakpoint
- [ ] Verify the middle panel has enough width for content
- [ ] Check the BOM table rendering at medium widths
- [ ] Verify the input area is still usable

### 4.3 Mobile (375×812)
- [ ] Verify tab bar at bottom switches between Draft/BOM views
- [ ] Check that sidebar icons collapse or become a hamburger menu
- [ ] Verify all touch targets are >= 44px
- [ ] Check the chat bubble input area — is it sticky at bottom?
- [ ] Verify no horizontal scrolling occurs
- [ ] Check the estimation panel — is it accessible via bottom sheet or slide-in?

### 4.4 Mobile Landscape
- [ ] Verify the layout adapts (not just a squished portrait)
- [ ] Check that the bottom tab bar doesn't interfere with content
- [ ] Verify keyboard input doesn't cover the textarea

### 4.5 Dark Theme
- [ ] If dark theme exists, verify all contrast ratios in both themes
- [ ] Check that the Material Icons render correctly (filled/unfilled)
- [ ] Verify text readability on dark backgrounds

---

## BLOCK 5 — General Best Practices

### 5.1 Skip-to-Content Link
**File:** `App.tsx`
**Problem:** "Skip to Main Content" link exists but may not be visible or keyboard-accessible.
**Fix:**
- Ensure the skip link is visible on focus: `.skip-link:focus { position: static; }`
- Style it as a visually-hidden link that appears on Tab: `sr-only focus:not-sr-only`
**Verify:** Pressing Tab immediately shows the skip link, clicking it jumps to main content

### 5.2 Loading States
**File:** `App.tsx` + AI service files
**Problem:** No visual feedback when AI is processing. Users might click "Send" multiple times.
**Fix:**
- Add a loading indicator in the textarea area: "Processing..." with a spinner or "Is thinking..." animation
- Disable the send button while processing
- Show a skeleton loading state for AI responses as they stream in
**Verify:** User gets clear feedback during processing

### 5.3 Error Recovery UI
**File:** `App.tsx` + API client
**Problem:** AI errors or timeouts result in silent failures with no user-facing error message.
**Fix:**
- Add error toast/banner for failed AI requests
- Include a "Retry" button in error messages
- Show user-friendly messages: "Unable to reach the AI service. Please check your connection." instead of technical error details
**Verify:** Errors are visible, actionable, and don't crash the app

### 5.4 Keyboard Navigation Completeness
**File:** `App.tsx` + components
**Problem:** Some custom components (dual-thumb sliders, custom checkboxes) may not be keyboard-accessible.
**Fix:**
- Ensure all interactive elements are reachable via Tab
- Ensure all interactive elements respond to Enter/Space
- For custom slider: ensure Arrow Left/Right changes the value
- For custom checkbox: ensure Enter/Space toggles the state
**Verify:** Full keyboard navigation through the app without a mouse

---

## Failing Tests — Current State (Run: 2026-05-25)

**Run:** `npx playwright test tests/accessibility.spec.ts --reporter=list`
**Result:** 10 passed, 10 failed (out of 20 total)

| # | Test | Line | Status | Root Cause |
|---|------|------|--------|------------|
| 1 | Sidebar navigation icons contrast | 4 | **FAIL** | Test returns `{pass: false, reason: 'no sidebar found'}` — sidebar `nav` element not matching the selector `nav[aria-label], aside, [class*="sidebar"]` or `nav`. The sidebar IS present with `aria-label` and `role="navigation"`. Likely test selector bug. |
| 2 | Center chat bubble icon contrast | 49 | **FAIL** | Test returns `{pass: true}` (an object) but `expect(pass).toBe(true)` expects a boolean. **Test bug**: line 73 returns `{pass: ratio >= 4.5, ratio}` — the `pass` variable is an object `{pass: true}`, not a bare `true`. Fix: `return ratio >= 4.5;` |
| 3 | Textarea input must have id + label | 81 | **FAIL** | No `id` attribute on textarea. Has `aria-label` but test requires BOTH `id` AND (`hasLabel` OR `ariaLabel`). Missing `<label>` element wrapping or `htmlFor` association. |
| 4 | File input must have id + label | 106 | **FAIL** | No `id` attribute on file inputs. The `<input type="file">` at line 1459 has `aria-label` but no `id`. The test checks `hasId && hasLabel` — no `<label>` element wraps these. |
| 5 | Focus-visible ring must be visible | 222 | **FAIL** | `:focus-visible` not detected after Tab press. Test does `page.keyboard.press('Tab')` then `expect(focused).toBeAttached()`. Element may not have proper focus styles, or `:focus-visible` isn't matching the focused element. |
| 6 | ARIA landmark roles | 266 | **FAIL** | `hasNavigation` is `false`. Test checks `[aria-label="Main navigation"]` or `[role="navigation"]`. The sidebar nav has `aria-label={i18n.t("aria.mainNavigation")}` which may expand to something other than "Main navigation". `hasMain` needs verification too. |
| 7 | Empty state guidance | 359 | **FAIL** | `[role="log"]` has no text matching `example|e.g.|such as|try|suggest|template` AND text length ≤ 30 chars. The chat log is empty on initial load with no placeholder guidance text. |
| 8 | ARIA live regions | 380 | **FAIL** | Needs ≥2 `[aria-live]` elements. Only 1 found. Need at least 2 dynamic content areas with aria-live. |
| 9 | Server connection indicator | 397 | **FAIL** | No element found with class containing: `connection`, `status`, `online`, `offline`, or `server`. The ServerStatusIndicator component exists but uses classes like `bg-amber-50`, `text-amber-800`, etc. — none match the test's class name pattern. |
| 10 | Settings modal sections | 415 | **FAIL** | Test can't find settings button or no section headers/fieldsets in modal. Test times out at 30s waiting for `button[aria-label*="Settings"], button:has-text("Settings")`. |

**Test Bugs Identified:**
- Test #2 (line 49): Returns `{pass: true}` object instead of boolean `true` at line 73. Fix: `return ratio >= 4.5;` instead of `return { pass: ratio >= 4.5, ratio };`
- Test #6 (line 266): Hard-coded `aria-label="Main navigation"` but the app uses `aria-label={i18n.t("aria.mainNavigation")}` which expands to a different string. Fix: test should use `[role="navigation"]` OR the app should use `aria-label="Main navigation"`.

---

## Summary: Priority Order for Sub-Agents

1. **BLOCK 1.1-1.8** (Critical a11y fixes) — These have automated tests and must pass before the rest
2. **BLOCK 3** (Test infrastructure) — Fix any test false-positives/negatives
3. **BLOCK 2.1-2.5** (Usability) — Improve real user experience
4. **BLOCK 4** (Visual audit) — Document findings and fix what's found
5. **BLOCK 5** (Best practices) — Polish and robustness

Each task is independent. Sub-agents should:
1. Read the task description above
2. Read the relevant source file
3. Make the fix
4. Rebuild Docker
5. Run the relevant accessibility test(s)
6. Report pass/fail status
7. Commit if passing
