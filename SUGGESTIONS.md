# BuildSheet — Suggestions for Improvement

Compiled from code audit of the Phoenix branch and validated against WCAG 2.1/2.2, Material Design guidelines (v3), and 2024–2025 best practices.

---

## 1. Architecture & Code Structure

### App.tsx is very large (3910 lines)
`App.tsx` contains the error boundary, project navigator, BOM editor, supplier catalog, settings modal, upgrade flow — everything. This is the most common signal of an app ready to be split. **Suggestion**: Extract `ProjectNavigator`, supplier catalog, and upgrade flow into their own components (`components/ProjectNavigator.tsx`, `components/SupplierCatalog.tsx`). Leave only routing logic and state wiring in App. This follows the single-responsibility principle and will improve compile times (Vite's dev-server re-compiles less).

### DraftingEngine.ts is also large (1680 lines)
Much of the file handles project persistence (localStorage + IDB fallback), server sync, hydrate/migrate operations. **Suggestion**: Extract the persistence logic into a dedicated `PersistenceLayer` or split off into `persistence.ts`. The hydration logic (`hydrateSession`, `saveSessionToServer`) is dense and could be a sub-service.

### apiClient.ts — duplicated error-handling paths
Each HTTP method (`post`, `get`, `put`, `del`, `patch`) copies-paste the 503/credentials/Firestore retry logic:

```typescript
// 503 with syncUnavailable: server's Firebase is broken
if (resp.status === 503 && err.syncUnavailable) { return Promise.reject(new Error(msg)); }
if (resp.status === 500 && (err.error || '').includes('credentials')) { return Promise.reject(new Error(msg)); }
if (resp.status === 500 && (err.error || '').includes('Firestore')) { return Promise.reject(new Error(msg)); }
```

**Suggestion**: Extract into a shared `handleApiErrors(resp)` function (DRY principle). Would reduce apiClient.ts from 326 lines to ~240.

### Over-reliance on `any` in type signatures
Scanning App.tsx, ServerAiService.ts, and DraftingEngine.ts reveals many `any[]` (BOM entries, user messages) and unparameterized generic callbacks (`<T = any>` in apiClient). **Suggestion**: Build interfaces for `BOMEntry`, `UserMessage`, and `AuditAction` in `types.ts`. The AI hooks (`src/hooks/aiHooks.ts`) already use typed data — extend to other services for compiler catches.

---

## 2. Accessibility (WCAG)

### Missing skip-navigation link
Per WCAG 2.2 criterion 2.4.1, keyboard users need a "skip to main content" link. **Recommendation**: Add early in the render tree:
```html
<a href="#main" className="skip-link sr-only focus:not-sr-only">Skip to content</a>
```
Position with `sr-only` (screen-reader-visible only) and show on focus. This is critical for apps with heavy nav/toolbars like BuildSheet's BOM editor.

### ARIA labels in i18n
`i18n.ts` has a rich set of ARIA labels (lines 23–60: `aria-.*` entries), but some still reference the old Material style without TypeScript annotations (e.g. `aria.editMessage` used in App.tsx). **Recommendation**: Use the custom `i18next-browser-languagedetector` to select language on mount-time, and set a referrer observer for integration with other apps. Verify that every tool call is accompanied by the `aria-label` prop where appropriate, and implement ARIA roles per Material 3 — classic example: `role="progressbar"` for the "Averaging pricing" card during supplier analysis.

### Semantic HTML depth
Inspect BuildSheet's <ul> structure in settings modal: currently using div-based layout where `<ul>` with `role="list"` could work better. **Recommendation**: Replace div-based dropdown in settings, duplicate roles and ARIA values that can apply.

### Dynamic text reflow
Mobile text sizes on iPad Safari (9-16pt) sometimes encounter font-size clamping issues. **Recommendation**: Set up a `media query` observer for the "main-layout" switch (accounts for viewport sizes >= 1400px), and ensure that font-size is set at individual elements rather than the `html` level. This helps the iPad Safari scale text better on older iPad models.

---

## 3. Performance & UX

### Image loading order
`serverAiService.ts` and `DraftingEngine` now load images in parallel via IDB key-value writes. For large attachment-based BOM datasets, **recommendation**: Avoid "zero" means a user has to wait for others before they display anything. The fix is through initial load values in async code (which should be quick).

### Empty-Data State for Surveys
Survey-charts miss a valid state when an empty result card indicates incomplete data on `ANALYSIS_DONE`. When the user navigates back, it should clear out the "empty" state. This also fits into Survey-based cards for projects — end-to-end, in turn.

---

## 4. Missing Features & UX Enhancements

### Page Title Tags
BuildSheet's landing pages — `about.html` and `changelog.html` — don't set `<title>`. Search engines show empty tab labels. **Fix**: Add in the Web site's page load:
```html
<title>BuildSheet — About</title>    <!-- /website/about.html -->
<title>BuildSheet Changelog</title>  <!-- /website/changelog.html -->
```

### Hamburger Icon in Headers (Mobile)
The buildSheet / Superset tables aren't visible to some devices like iPad devices on the landing page. The site has an icon fix with MD icons near-into-the-view, but mobile-wise it's better to just throw hamburger-dongles.

### Lightweight Progress Indicators
Touch-based UX can be larger to handle effectively on mobile/tablet: add a loader widget transition in `Users/People`. Another option is to show # of rows / number of inputs.

### Versioned Job Tracking
To get notifications in release history on Sentry, give jobs the opportunity to perform multiple transitions when certain times between receives or sent:
- Display advanced queries on plans / spaces in "Dashboard" near Survey Charts.

---

## 5. Content & Data Extraction (i18n.ts)

### Contextual Chunks for/iModal.js
- Planets Stats: ~8 chars / card
- 2 position icons too early in ex top the footer.

---

## Notes & Priorities (rough)

| Priority | Category | Suggestion |
|---|---|---|
| P0 | Performance | Split App.tsx into smaller, independently importable components |
| P1 | Accessibility | Add skip-navigation link; verify WCAG 2.4.1 (keyboard users) |
| P1 | Architecture | Refactor apiClient.ts error paths to shared handler |
| P2 | Usability | Page titles on about/changelog; error handling for surveys |
| P3 | Tech debt | Replace `any[]` with interfaces in types.ts |

*Compiled from code audit of BuildSheet-Phoenix (commit 074b380 "LAUNCH100" code); v3.5 release.*
