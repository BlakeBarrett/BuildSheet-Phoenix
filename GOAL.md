# BuildSheet Phoenix — ui-refresh Project Goal

## Mission

Make BuildSheet Phoenix accessible, usable, and delightful across every screen size and interaction mode.

BuildSheet is an AI-native hardware architect tool. It lets users describe electronic/mechanical projects in natural language and produces validated BOMs, manufacturing plans, and sourcing intelligence. The core product is technically sophisticated but the interface needs to match that quality for **all users** — not just mouse-and-keyboard power users, but keyboard navigators, screen reader users, and mobile users alike.

This project (`ui-refresh`) systematically hardens the app's accessibility, responsiveness, and human-centric design.

---

## Scope

**What's in scope:**

1. **WCAG 2.1 AA compliance** — All 20 accessibility tests must pass (164 existing tests must remain passing).
2. **Responsive layout** — The app must look and function correctly at all supported breakpoints:
   - Desktop: 1280px+ (3-column layout)
   - Laptop: 1024-1279px (2-column, right panel may collapse)
   - Tablet: 768-1023px (2-column or stacked)
   - Mobile: 375-767px (single column, bottom tab navigation)
   - Mobile landscape and foldable orientations
3. **Keyboard navigation** — Every interactive element must be reachable and operable via keyboard alone (Tab, Enter, Space, Arrow keys).
4. **Touch targets** — All interactive elements must be at least 44x44px on touch devices.
5. **Contrast** — All text and meaningful UI elements must meet WCAG AA contrast ratios (4.5:1 for normal text, 3:1 for large text and UI components).
6. **Semantic HTML & ARIA** — Proper heading hierarchy (h1-h3), landmark roles, and accessible names on all controls.
7. **Error states & loading feedback** — Users must always know what's happening: loading, success, and error states with clear messaging.
8. **Usability enhancements** — Icon labels, better placeholders, example prompts, and visual hierarchy improvements.

**What's out of scope:**

- Changes to the AI/drafting engine logic
- Backend API changes
- Authentication/authorization changes
- New features or content additions
- Font or color palette redesigns (we fix contrast within the existing M3 palette)

---

## Success Criteria

### Hard gates (must pass):

- All 20 new accessibility tests in `tests/accessibility.spec.ts` pass
- All 164 existing Playwright tests continue to pass
- Zero console errors on clean page load
- Zero console errors during full keyboard navigation cycle
- Docker rebuild succeeds without errors

### Visual gates (reviewed by user):

- App looks correct at 1280px, 1024px, 768px, and 375px viewport widths
- Both portrait and landscape mobile orientations work
- Tab bar at bottom of mobile screen switches between Draft/BOM views
- Sidebar icons have visible tooltips on hover
- Server status indicator appears when backend is unreachable
- Disclaimer text is readable (not washed out)

### Experience gates:

- Keyboard-only user can complete: open settings, change one setting, close settings
- Keyboard-only user can: type a prompt, submit it, see loading state, see response
- Screen reader user can: identify page structure, understand what to do first
- Touch user on 375px screen: tap every button, switch tabs, dismiss any dialogs

---

## Working Model: Sub-Agent Orchestration

This project is designed to be executed by **multiple sub-agents running in parallel**, each handling one or more tasks from TODO.md. Here's how a fresh session should work:

### Step 1: Load this file and TODO.md

```
Load GOAL.md (this file) and TODO.md to understand the full scope and task breakdown.
```

### Step 2: Prioritize blocks

Follow the priority order in TODO.md:
1. **BLOCK 1** — Critical accessibility fixes (8 failing tests). These have automated tests and can be validated instantly.
2. **BLOCK 3** — Test infrastructure fixes (if any false-positives found).
3. **BLOCK 2** — Usability enhancements (visual improvements).
4. **BLOCK 4** — Visual audit across breakpoints (documentation + fixes).
5. **BLOCK 5** — General best practices polish.

### Step 3: Delegate tasks to sub-agents

For BLOCK 1 tasks, batch independent fixes together. Example:

```
Delegate to sub-agent(s):
- Fix 1.1 (sidebar icon contrast) + 1.2 (chat bubble contrast) + 1.8 (disclaimer contrast)
  — These are all CSS color/contrast fixes in different files
- Fix 1.3 (icon name leaks) + 1.4 (aria-label match)
  — These affect the same Material3UI.tsx component
- Fix 1.6 (heading hierarchy) + 1.7 (server status indicator)
- Fix 1.5 (touch targets)
```

For each sub-agent, pass:
- The task ID and description from TODO.md
- The file path(s) to modify
- The test file and line number to verify against
- The constraint: **branch must be `ui-refresh`, never `dev`**

### Step 4: Each sub-agent's workflow

Every sub-agent must follow this pattern:

1. **Read** the task description from TODO.md
2. **Read** the relevant source file(s) to understand context
3. **Make the fix** using `patch` or `write_file`
4. **Rebuild Docker**: `docker build --no-cache --load && docker-compose up -d`
5. **Verify the test**: `npx playwright test tests/accessibility.spec.ts --grep "<test name>"`
6. **Verify existing tests**: Run the full suite briefly (`npx playwright test --list | wc -l` to confirm 179 tests)
7. **Report**: Return a summary of what was changed, which tests passed/failed
8. **Commit**: `git add -A && git commit -m "<scope>(<feature>): <description>"`

### Step 5: Visual review (human-in-the-loop)

After all BLOCK 1 tests pass, the orchestrator should:
1. Rebuild Docker one final time
2. Navigate to `http://localhost:8080/app/` in the browser
3. Take screenshots at each breakpoint (1400px, 1024px, 768px, 375px)
4. Verify visual quality
5. Iterate on any visual issues flagged

### Step 6: Final commit

```
git add -A
git commit -m "chore(ui): complete accessibility and usability refresh

- Fix 8 failing accessibility tests (contrast, headings, focus, touch targets)
- Add server status indicator
- Improve sidebar icon accessibility
- Enhance touch targets and visual hierarchy
- All 184 tests passing (164 original + 20 accessibility)"
```

---

## Key Constraints

| Constraint | Detail |
|---|---|
| **Branch** | `ui-refresh` — NEVER commit to `dev` |
| **Docker** | Must rebuild after every source change: `docker build --no-cache --load && docker-compose up -d` |
| **Tests** | `npx playwright test` — 179 total (164 original + 20 new) |
| **App URL** | `http://localhost:8080/app/` |
| **No secrets** | Redact API keys, tokens, credentials as `[REDACTED]` |
| **Incremental commits** | One logical change per commit |

---

## File Map

| File | Purpose |
|---|---|
| `TODO.md` | Detailed task breakdown — sub-agents work from this |
| `App.tsx` | Main app component — layout, landmarks, headings, nav |
| `components/Material3UI.tsx` | Reusable M3 components (Button, IconButton, Chip, Card) |
| `components/SettingsModal.tsx` | Settings dialog — already mostly accessible |
| `components/VoiceSession.tsx` | Voice recording session — already patched |
| `tests/accessibility.spec.ts` | 20 accessibility tests |
| `index.html` | Page metadata — already patched (description, OG tags) |
| `public/buildsheet-icon.svg` | SVG favicon — already created |

---

## Post-Project Handoff

When all tasks are complete:

1. Run the full test suite one final time: `npx playwright test --reporter=line`
2. Confirm all 184 tests pass
3. Run `git diff dev..HEAD --stat` to review the full change set
4. Present results to the user with a summary of:
   - Tests: X/184 passing
   - Files changed: N
   - Docker rebuild count: N
   - Any remaining known issues or TODOs for the next session
