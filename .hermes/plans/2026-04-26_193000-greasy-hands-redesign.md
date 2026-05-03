# BuildSheet Marketing Website — "Greasy Hands" Redesign

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Completely redesign the BuildSheet marketing website to target builders, makers, mechanics, and engineers (the "Greasy Hands" market) while preserving all existing login/signup flows, legal compliance, and i18n infrastructure.

**Architecture:** Static HTML/CSS/JS marketing site (no React framework — the React app is the product at /app/). The redesign replaces all marketing pages with a workshop/blueprint-inspired aesthetic while keeping the Firebase Auth, Stripe checkout, cookie consent, and legal pages intact.

**Design Direction — "Greasy Hands":**
- **Vibe:** Workshop, blueprint, tool-shed, industrial — authentic, not corporate SaaS
- **Colors:** Blueprint blue (#1a3a5c), warm steel grays, copper/amber accents, oil-black backgrounds
- **Typography:** JetBrains Mono for data/specs, Inter for body, a bold display font for headlines
- **Visual language:** Grid lines, measurement marks, tool icons, schematic borders, blueprint patterns
- **Tone:** Direct, technical, no-bullshit — speaks to people who get grease under their nails
- **Imagery:** Blueprint grids, measurement annotations, tool silhouettes, workshop textures

**What stays the same:**
- Firebase Auth login/signup (Google + email link) — links at `/app/` unchanged
- Stripe checkout flow — unchanged
- Cookie consent banner — preserved, updated styling only
- Legal pages (privacy, terms, cookie-policy, dpa) — content preserved
- i18n infrastructure (i18next) — preserved, expanded
- Deploy pipeline (Docker → Cloud Run) — unchanged
- About page, changelog — preserved, updated styling
- Firebase Firestore form submissions (newsletter, contact sales) — preserved

---

## Task 1: Create new color palette and design tokens

**Objective:** Define the "Greasy Hands" design system in CSS custom properties.

**Files:**
- Modify: `website/css/variables.css`

**Changes:** Replace the current "corporate SaaS navy/teal" palette with an industrial blueprint palette.

```css
:root {
  /* ── Blueprint Palette ─────────────────────── */
  --color-blueprint-dark: #0a1628;      /* oil-black background */
  --color-blueprint: #1a3a5c;           /* deep blueprint blue */
  --color-blueprint-mid: #2a5a8c;       /* blueprint surface */
  --color-blueprint-light: #3a7ab5;     /* blueprint highlight */
  --color-blueprint-pale: #5a9ad4;      /* blueprint text on dark */
  --color-blueprint-faint: #7ab8e8;     /* blueprint grid lines */
  --color-blueprint-white: #c8e0f0;     /* blueprint white (not pure white) */

  /* ── Warm Industrial Accents ──────────────── */
  --color-copper: #c87941;              /* primary accent */
  --color-copper-light: #e8a060;        /* hover states */
  --color-copper-glow: rgba(200, 121, 65, 0.25);
  --color-copper-glow-strong: rgba(200, 121, 65, 0.45);
  --color-amber: #d4a017;               /* warnings, highlights */
  --color-amber-light: #f0c040;
  --color-steel: #8a9bae;               /* secondary text */
  --color-steel-light: #b0c0d0;
  --color-steel-dark: #5a6a7a;

  /* ── Semantic ─────────────────────────────── */
  --color-success: #4a9a5a;             /* green (workshop safe) */
  --color-warning: var(--color-amber);
  --color-error: #c44a3a;               /* rust red */

  /* ── Gradients ────────────────────────────── */
  --gradient-accent: linear-gradient(135deg, var(--color-copper), var(--color-copper-light));
  --gradient-accent-hover: linear-gradient(135deg, var(--color-copper-light), var(--color-amber));
  --gradient-hero: linear-gradient(180deg, var(--color-blueprint-dark) 0%, var(--color-blueprint) 100%);
  --gradient-card: linear-gradient(145deg, rgba(42, 90, 140, 0.3) 0%, rgba(26, 58, 92, 0.15) 100%);
  --gradient-border: linear-gradient(135deg, var(--color-copper), var(--color-blueprint-light), var(--color-copper));
  --gradient-text: linear-gradient(135deg, var(--color-copper), var(--color-amber-light));

  /* ── Dark Mode (Default) ──────────────────── */
  --bg-primary: var(--color-blueprint-dark);
  --bg-secondary: var(--color-blueprint);
  --bg-surface: var(--color-blueprint-mid);
  --bg-surface-hover: var(--color-blueprint-light);
  --bg-glass: rgba(10, 22, 40, 0.8);
  --bg-glass-strong: rgba(10, 22, 40, 0.95);

  --text-primary: var(--color-blueprint-white);
  --text-secondary: var(--color-steel-light);
  --text-tertiary: var(--color-steel);
  --text-muted: var(--color-blueprint-faint);

  --border-subtle: rgba(122, 184, 232, 0.08);
  --border-default: rgba(122, 184, 232, 0.15);
  --border-strong: rgba(200, 121, 65, 0.3);

  --divider: rgba(122, 184, 232, 0.08);

  /* ── Typography ───────────────────────────── */
  --font-heading: 'Inter', system-ui, -apple-system, sans-serif;
  --font-body: 'Inter', system-ui, -apple-system, sans-serif;
  --font-mono: 'JetBrains Mono', 'Fira Code', ui-monospace, monospace;
  --font-display: 'Inter', system-ui, sans-serif;

  /* Keep all spacing, radius, shadow, transition tokens unchanged */
  /* (all --space-*, --radius-*, --shadow-*, --transition-*, --z-*, --text-* tokens preserved) */
}

/* Light mode — workshop paper / tracing paper feel */
[data-theme="light"] {
  --bg-primary: #f4efe6;              /* warm paper */
  --bg-secondary: #ebe5d8;            /* slightly darker paper */
  --bg-surface: #ffffff;              /* white paper */
  --bg-surface-hover: #e8e0d0;
  --bg-glass: rgba(244, 239, 230, 0.8);
  --bg-glass-strong: rgba(244, 239, 230, 0.95);

  --text-primary: #1a2a3a;
  --text-secondary: #4a5a6a;
  --text-tertiary: #6a7a8a;
  --text-muted: #8a9aaa;

  --border-subtle: rgba(26, 58, 92, 0.06);
  --border-default: rgba(26, 58, 92, 0.12);
  --border-strong: rgba(200, 121, 65, 0.25);

  --divider: rgba(26, 58, 92, 0.08);

  --gradient-hero: linear-gradient(180deg, #f4efe6 0%, #ebe5d8 100%);
  --gradient-card: linear-gradient(145deg, rgba(255,255,255,0.9) 0%, rgba(244,239,230,0.6) 100%);

  --shadow-sm:  0 1px 2px rgba(26, 22, 10, 0.05);
  --shadow-md:  0 4px 6px -1px rgba(26, 22, 10, 0.07), 0 2px 4px -2px rgba(26, 22, 10, 0.05);
  --shadow-lg:  0 10px 15px -3px rgba(26, 22, 10, 0.08), 0 4px 6px -4px rgba(26, 22, 10, 0.05);
  --shadow-xl:  0 20px 25px -5px rgba(26, 22, 10, 0.08), 0 8px 10px -6px rgba(26, 22, 10, 0.04);
  --shadow-2xl: 0 25px 50px -12px rgba(26, 22, 10, 0.15);
}
```

**Verification:** The CSS file should have the same structure (dark mode defaults + light mode overrides) but with the new color names. All spacing/radius/shadow/transition tokens remain identical.

---

## Task 2: Redesign base styles — blueprint grid background

**Objective:** Replace the corporate teal grid with a blueprint-style grid and workshop-inspired body styling.

**Files:**
- Modify: `website/css/base.css`

**Changes:**
1. Update `body::before` blueprint grid — change from teal to blueprint blue, add measurement tick marks
2. Update link colors to copper accent
3. Update selection colors to copper
4. Update focus ring to copper
5. Update `.text-gradient` to use copper gradient
6. Update `.sr-only` and utility classes (keep structure, update any color refs)

```css
/* Blueprint grid background — the signature look */
body::before {
  content: '';
  position: fixed;
  inset: 0;
  z-index: -1;
  opacity: 0.04;
  background-image:
    linear-gradient(var(--color-blueprint-faint) 1px, transparent 1px),
    linear-gradient(90deg, var(--color-blueprint-faint) 1px, transparent 1px),
    linear-gradient(var(--color-blueprint-faint) 1px, transparent 1px),
    linear-gradient(90deg, var(--color-blueprint-faint) 1px, transparent 1px);
  background-size:
    60px 60px,
    60px 60px,
    10px 10px,
    10px 10px;
  pointer-events: none;
}

[data-theme="light"] body::before {
  opacity: 0.06;
  background-image:
    linear-gradient(var(--color-blueprint-mid) 1px, transparent 1px),
    linear-gradient(90deg, var(--color-blueprint-mid) 1px, transparent 1px),
    linear-gradient(var(--color-blueprint-mid) 0.5px, transparent 0.5px),
    linear-gradient(90deg, var(--color-blueprint-mid) 0.5px, transparent 0.5px);
  background-size:
    60px 60px,
    60px 60px,
    10px 10px,
    10px 10px;
}

/* Links */
a {
  color: var(--color-copper);
  text-decoration: none;
  transition: var(--transition-colors);
}
a:hover {
  color: var(--color-copper-light);
}

/* Selection */
::selection {
  background-color: var(--color-copper);
  color: var(--color-blueprint-dark);
}

/* Focus */
:focus-visible {
  outline: 2px solid var(--color-copper);
  outline-offset: 2px;
  border-radius: var(--radius-sm);
}

/* Gradient text */
.text-gradient {
  background: var(--gradient-text);
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
}
```

---

## Task 3: Redesign navbar — tool-clip aesthetic

**Objective:** Create a navbar that feels like a workshop tool clip — functional, industrial, with measurement marks.

**Files:**
- Modify: `website/index.html` (navbar section)
- Modify: `website/css/components.css` (navbar styles)

**HTML changes for navbar:**
- Add "spec line" decorative element (small measurement tick marks along bottom edge)
- Change logo to use a wrench/gear icon instead of plain "B"
- Update nav links with monospace labels
- Add a small "v1.0" version badge

**CSS changes:**
- Navbar background: blueprint dark with blueprint grid overlay
- Bottom border: measurement tick marks (CSS pseudo-elements with repeating gradients)
- Hover states: copper glow
- Active state: copper underline
- Hamburger: tool-icon style

---

## Task 4: Redesign hero section — blueprint reveal

**Objective:** Create a hero that feels like unrolling a blueprint — dramatic, technical, inspiring.

**Files:**
- Modify: `website/index.html` (hero section)
- Modify: `website/css/sections.css` (hero styles)

**New hero concept:**
- Headline: "Build it. Document it. Ship it." — short, punchy, workshop-ready
- Subheadline: "AI-powered build sheets, automatic BOM generation, and real-time part search — for the people who actually build things."
- CTA: "Start Building Free" (keep as-is)
- Background: deep blueprint with animated grid reveal
- Decorative elements: measurement annotations, dimension lines, corner crosshairs (like a real blueprint)
- App screenshot framed with blueprint border and corner marks

---

## Task 5: Redesign features section — spec-sheet cards

**Objective:** Present features like technical specifications on a parts datasheet.

**Files:**
- Modify: `website/index.html` (features section)
- Modify: `website/css/sections.css` (features styles)

**New card concept:**
- Cards look like engineering spec sheets / datasheets
- Each card has a "part number" style header (e.g., "BS-001: AI DRAFTING ENGINE")
- Icons are tool icons (wrench, gear, caliper, blueprint, etc.)
- Hover effect: blueprint glow border
- Grid: 2x3 on desktop, stacked on mobile

---

## Task 6: Redesign "How It Works" — workflow diagram

**Objective:** Present the 3-step process as a workshop workflow / assembly line.

**Files:**
- Modify: `website/index.html` (how-it-works section)
- Modify: `website/css/sections.css` (steps styles)

**New concept:**
- Horizontal workflow with measurement arrows between steps
- Steps look like assembly instructions
- Step numbers in monospace: "STEP 01", "STEP 02", "STEP 03"
- Connecting lines with measurement tick marks

---

## Task 7: Redesign pricing — workshop pricing board

**Objective:** Make pricing feel like a workshop price board — honest, transparent, no BS.

**Files:**
- Modify: `website/index.html` (pricing section)
- Modify: `website/css/sections.css` (pricing styles)

**Changes:**
- Pricing cards styled like spec sheets with copper accent borders
- "Most Popular" badge replaced with a copper tag
- Free Pro promo stays but styled as a workshop sticker/warning label
- Billing toggle styled as a mechanical switch

---

## Task 8: Redesign on-prem section — server rack aesthetic

**Objective:** Make the on-prem section feel like a data center / server room.

**Files:**
- Modify: `website/index.html` (on-prem section)
- Modify: `website/css/sections.css` (on-prem styles)

**Changes:**
- Server rack illustration with LED indicators
- Darker background with grid pattern
- Copper accent borders
- "Coming Soon" replaced with a more subtle indicator

---

## Task 9: Redesign FAQ section — workshop manual style

**Objective:** FAQ styled like a workshop manual / troubleshooting guide.

**Files:**
- Modify: `website/index.html` (faq section)
- Modify: `website/css/sections.css` (faq styles)

**Changes:**
- Accordion items styled like manual entries
- Question numbers in monospace
- Copper accent for open state
- Technical manual feel

---

## Task 10: Redesign footer — workshop sign-off

**Objective:** Footer that feels like the back of a workshop manual.

**Files:**
- Modify: `website/index.html` (footer section)
- Modify: `website/css/sections.css` (footer styles)

**Changes:**
- Blueprint grid background
- Monospace labels
- Copper accent links
- Legal links preserved
- Newsletter styled as a "workshop newsletter" signup

---

## Task 11: Update components.css — buttons, badges, cards

**Objective:** Update all shared component styles to match the new design system.

**Files:**
- Modify: `website/css/components.css`

**Changes:**
- Buttons: copper gradient primary, blueprint surface secondary
- Badges: copper background for accent badges
- Cards: blueprint surface with copper border on hover
- All transitions preserved

---

## Task 12: Update i18n — expand translations

**Objective:** Expand the i18n resources with all new copy for the redesigned site.

**Files:**
- Modify: `website/js/i18n.js`

**Changes:**
- Add all new hero, features, pricing, FAQ translations
- Keep existing language support (en, es, pt-BR, fr, sw, ar)
- Add RTL support for Arabic
- Add new translation keys for all redesigned sections

---

## Task 13: Update animations — blueprint effects

**Objective:** Replace floating shapes with blueprint-style decorative animations.

**Files:**
- Modify: `website/js/animations.js`
- Modify: `website/css/animations.css`

**Changes:**
- Replace floating geometric shapes with blueprint corner marks and dimension lines
- Add measurement-line drawing animations
- Add blueprint grid reveal animation on page load
- Keep reduced-motion support

---

## Task 14: Update responsive.css — mobile-first blueprint

**Objective:** Ensure the blueprint aesthetic works on all screen sizes.

**Files:**
- Modify: `website/css/responsive.css`

**Changes:**
- Blueprint grid scales appropriately
- Cards stack properly
- Navbar collapses to hamburger
- Pricing cards stack vertically
- All spacing adapts for mobile

---

## Task 15: Update legal pages — consistent styling

**Objective:** Update all legal pages to match the new design system while preserving content.

**Files:**
- Modify: `website/privacy.html`
- Modify: `website/terms.html`
- Modify: `website/cookie-policy.html`
- Modify: `website/dpa.html`
- Modify: `website/about.html`
- Modify: `website/changelog.html`

**Changes:**
- Update to use new CSS variables
- Preserve all legal content exactly as-is
- Update back-link styling
- Add blueprint grid background
- Add copper accent for important callouts

---

## Task 16: Update cookie consent — new styling

**Objective:** Update cookie consent banner to match new design.

**Files:**
- Modify: `website/js/cookie-consent.js`

**Changes:**
- Update banner colors to use new CSS variables
- Update button styles to copper accent
- Preserve all functionality exactly

---

## Task 17: Create new assets — blueprint corner marks, tool icons

**Objective:** Create SVG assets for the new design.

**Files:**
- Create: `website/assets/images/hero-mockup.png` (keep existing or update)
- Create: `website/assets/svg/blueprint-corners.svg`
- Create: `website/assets/svg/tool-icons.svg` (sprite sheet)
- Create: `website/assets/images/workshop-texture.png` (subtle texture overlay)

---

## Task 18: Update about page — workshop origin story

**Objective:** Refresh the about page with the new design while preserving the origin story.

**Files:**
- Modify: `website/about.html`

**Changes:**
- Apply new design system
- Update hero section with blueprint aesthetic
- Preserve all content about Blake Barrett, the CB750 rebuild origin, and the hackathon story
- Add a "build log" timeline visualization

---

## Task 19: Update changelog — workshop build log

**Objective:** Refresh the changelog with the new design.

**Files:**
- Modify: `website/changelog.html`

**Changes:**
- Apply new design system
- Style tags as workshop labels
- Preserve all existing changelog entries
- Add a "latest build" indicator

---

## Task 20: 404 page — lost in the workshop

**Objective:** Create a fun 404 page with workshop theme.

**Files:**
- Modify: `website/404.html`

**Changes:**
- Workshop-themed 404: "Looks like you wandered off the blueprint"
- Blueprint grid background
- Copper accent buttons
- Link back to home

---

## Task 21: Update coming-soon page

**Objective:** Update the coming soon page if it still exists.

**Files:**
- Modify: `website/coming-soon.html` (if it exists, consider removing or updating)

**Changes:**
- Either remove (if not needed) or update to match new design

---

## Task 22: Verify login/signup flows unchanged

**Objective:** Ensure all login/signup links still point to the correct `/app/` endpoints.

**Files:**
- Verify: All `href="/app/?login=true"` links
- Verify: All `href="/app/` links (Live Demo, Get Started, etc.)
- Verify: Firebase config references in `firebase-forms.js` preserved
- Verify: Stripe checkout references preserved

**Verification checklist:**
- [ ] Login button → `/app/?login=true`
- [ ] Live Demo button → `/app/`
- [ ] Firebase SDK URLs unchanged
- [ ] Firebase config keys read from `window._env_` unchanged
- [ ] Stripe payment references unchanged
- [ ] All auth-related JavaScript preserved

---

## Task 23: Verify deployment pipeline

**Objective:** Ensure deploy.sh and Dockerfile still work with the redesigned site.

**Files:**
- Verify: `Dockerfile` — `cp -r website/. /var/www/marketing/` still valid
- Verify: `nginx.conf` — routing rules unchanged
- Verify: `deploy.sh` — build process unchanged
- Verify: `env.sh` — env injection still works

---

## Risk Assessment

1. **Login/signup breakage:** Low risk — we're only changing the marketing site HTML/CSS, not the React app. All auth links point to `/app/` which is untouched.
2. **i18n breakage:** Low risk — we're expanding the translation object, not removing keys.
3. **Legal compliance:** Zero risk — legal page content is preserved exactly.
4. **Deployment:** Zero risk — Docker build and nginx config unchanged.
5. **Cookie consent:** Low risk — functionality preserved, only styling updated.

## Open Questions

1. Should we add a workshop photo hero image (real photo vs. CSS-only blueprint)?
2. Should the about page link to the GitHub repo prominently?
3. Any specific tool imagery the user has in mind?
4. Should we add a "built with" section showing the tech stack?

## Files That Will Change

| File | Change Type |
|------|------------|
| `website/index.html` | Major redesign |
| `website/css/variables.css` | Color palette replacement |
| `website/css/base.css` | Grid background, link colors |
| `website/css/components.css` | Button, badge, card styles |
| `website/css/sections.css` | All section styles |
| `website/css/responsive.css` | Mobile breakpoints |
| `website/css/animations.css` | Blueprint animations |
| `website/js/i18n.js` | Expanded translations |
| `website/js/animations.js` | Blueprint effects |
| `website/js/cookie-consent.js` | Banner styling |
| `website/privacy.html` | Styling update |
| `website/terms.html` | Styling update |
| `website/cookie-policy.html` | Styling update |
| `website/dpa.html` | Styling update |
| `website/about.html` | Design refresh |
| `website/changelog.html` | Design refresh |
| `website/404.html` | Workshop theme |
| `website/assets/` | New SVG assets |
