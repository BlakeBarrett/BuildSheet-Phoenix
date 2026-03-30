# BuildSheet — Product TODO & Roadmap

> A comprehensive gap analysis between the **marketing website's promises** and the **current implementation**, plus a full architectural roadmap for moving from a browser-only app to a production-grade backend/frontend SaaS platform.

---

## Legend

- `[ ]` Not started
- `[~]` Partially implemented / stubbed
- `[x]` Done
- `[?]` Deferred but still in plan

---

## 📌 Active Backlog (Original Tasks)

### 1. Visual Parts Audit
- `[x]` Multimodal interface to upload images of physical components alongside natural language prompts
- `[x]` AI identification and condition reporting of mechanical components

### 2. BOM Lifecycle Management
- `[x]` Add/Remove/Edit for BOM entries
- `[x]` Manual edits trigger Architect re-validation (constraint check)
- `[x]` Sub-assembly nesting — `parentInstanceId` set via PartDetailModal, recursive tree renderer in BOM list
- `[x]` Undo/redo for BOM changes — 50-deep snapshot stack, Ctrl+Z / Ctrl+Shift+Z

### 3. Kinematic-to-CAD Bridge
- `[x]` OpenSCAD generation pipeline (`generateEnclosure` in `geminiService.ts`)
- `[x]` In-app OpenSCAD viewer / preview — code viewer in PartDetailModal
- `[x]` Export `.scad` file directly from BOM entry
- `[ ]` STL preview via Three.js or similar

### 4. Legacy Manual Archaeology (PDF Ingestion)
- `[?]` Pipeline to ingest and verify structural/mechanical data from 1970s PDF service manuals
- `[?]` Extract parts from scanned documents and map them to BOM entries

### 5. Industrial & Safety _(Roundtable Demo Priority)_
- `[ ]` **Automotive Safety Auditor** — Validate BOM plan against ISO 26262 / ISO 8800; AI-driven violation report surfaced in a dedicated panel. Extends the existing `audit` prompt in `geminiService.ts`.
- `[ ]` **VIN & Recall Grounding** — Enter a VIN; auto-pull NHTSA safety bulletins and OEM service notices and ground them to the relevant BOM frame/engine entries.

---

## 🔴 CRITICAL: Features Promised on the Marketing Website — Not Yet Built

These are features the `website/index.html` explicitly advertises that are **not yet functional** in the actual app (`App.tsx`).

### Export
- `[x]` **JSON export** — `exportManifest()` works and downloads a `.json` file.
- `[x]` **PDF export** — print-optimized window with styled BOM table (via `window.print()`)
- `[x]` **CSV export** — `exportCSV()` in DraftingEngine, button in nav rail
- `[x]` **BOM import from CSV** — `importCSV()` in DraftingEngine with auto-detected column mapping + drag-and-drop CSV modal in the nav rail.
- `[x]` **Paste-in BOM import** — `importPastedText()` in DraftingEngine; supports free-text lists, quantity prefixes/suffixes, tab-separated, and CSV auto-detection. Accessible via the Import modal.

### Project Management
- `[~]` **Project list / history** — `ProjectNavigator` shows local projects stored in `localStorage`. Limited to the current browser/device.
- `[x]` **Project search and filtering** — live search input in `ProjectNavigator`; filters by name and preview text.
- `[ ]` **Project tags / labels**
- `[x]` **Project archiving** — `archiveProject()` / `unarchiveProject()` in DraftingEngine; toggle archived view in ProjectNavigator.
- `[x]` **Project duplication** — `duplicateProject()` in DraftingEngine; deep-clones BOM and messages. Accessible via copy button in ProjectNavigator.
- `[ ]` **Project templates** — suggested in marketing copy.
- `[ ]` **Project thumbnail generation** — thumbnails are explicitly disabled (`thumbnail: undefined // DISABLE THUMBNAILS to save space in the index`).

### Visual Assembly View (the Chilton Visualizer)
- `[~]` **AI-generated concept image** — `ChiltonVisualizer` shows Gemini-generated PNG images. This is a flat image, not an interactive assembly.
- `[x]` **The "Visualizer" panel shown in the hero mockup** — `VisualManifestRenderer` renders `VisualComponent[]` as an SVG block diagram in the hero area. Populated from architect responses or auto-generated as fallback from BOM.
- `[x]` **Interactive explorable visualization** — SVG blocks are clickable (jumps to BOM entry), hoverable (highlight + shadow), with port indicators color-coded by type.
- `[x]` **Dependency graph / port-connection diagram** — Dashed connection lines with arrowheads drawn between adjacent components; port dots displayed at bottom of each block, color-coded by `PortType`.

### Authentication & User Accounts
- `[~]` **Google Sign-In** — `UserService.login()` exists but returns a **hardcoded mock user** (`google-oauth2|...`). No real OAuth flow is implemented. `firebase.ts` is intentionally blank.
- `[ ]` **Real Auth0 / Firebase Auth integration** — The import comment says "Auth0 (Simulated)". Replace with the real SDK.
- `[ ]` **Session persistence tied to real user identity** — Currently all data lives in `localStorage` keyed by a random ID, not by user account. Logging in/out does nothing to project ownership.
- `[ ]` **User profile page** — avatar, name, email, account settings.
- `[ ]` **Password reset / magic link flows**
- `[ ]` **SSO / Enterprise SAML** (advertised in Team tier)

### Collaboration & Sharing
- `[ ]` **Real shareable project URLs** — `getShareUrl()` generates a path like `/username/project-slug` but there is no router, no server, and no way to load a shared project by URL. Clicking the share button only copies a dead link.
- `[ ]` **Shared workspaces** (advertised in Team tier) — no concept of org-level project ownership.
- `[ ]` **Role-based access control** (advertised in Team tier) — no roles exist beyond "owner" (mock).
- `[ ]` **Commenting / annotation on build sheets** Integrate with "Lore App" (also by Blake Barrett)
- `[ ]` **Real-time collaborative editing** (implied by "Collaborate" feature card)

### Data Security (advertised in FAQ)
- `[ ]` **Encryption at rest** — all data is in plain `localStorage` / IndexedDB. No encryption.
- `[ ]` **SOC 2 compliance** — advertised. N/A without a real backend.
- `[x]` **Audit logs** — `ActivityLogService` now persists to IndexedDB (`buildsheet_activity_log` key); auto-loaded on startup with a 500-entry rolling cap.
- `[ ]` **"We never use your data to train AI models"** — this requires a policy/backend to enforce, not just a promise.

### API Access
- `[ ]` **Public REST API** — advertised in the Team tier ("API access"). No API exists.
- `[ ]` **API key management UI**
- `[ ]` **API documentation / OpenAPI spec**
- `[ ]` **Webhooks** (reasonable expectation for a Team tier)

### AR Guide
- `[~]` **AR Guide View** — `ARGuideView.tsx` exists and uses the camera. It calls `aiService.getARGuidance()` which sends camera frames to Gemini. Basic.
- `[ ]` **Spatial anchoring / overlay** — the "Live assembly overlay via camera" claim implies AR anchors. The current implementation just shows the camera feed + a text prompt from Gemini.
- `[ ]` **Audio guidance** — `gemini-2.5-flash-native-audio-preview` is referenced in model name but audio output is unused; only text is read.
- `[ ]` **"Greasy Hands" Voice Mode** — Dedicated hands-free voice session using `gemini-2.5-flash-native-audio-preview`; push-to-talk triggers BOM queries, part lookups, and step-by-step guidance without touching the screen. _(High demo value — show in a shop environment)_

---

## 🟡 Backend Migration: Browser → Server

The app currently runs entirely in the browser. All AI calls go directly from the client to the Gemini API (requiring users to have/expose their own API key). A proper backend is needed to:

1. Protect API keys from clients
2. Enforce billing/rate limits per plan tier
3. Store projects server-side (multi-device, multi-user)
4. Enable real sharing, collaboration, and auditability

### Proposed Backend Stack

```
Node.js (Fastify or Hono) + TypeScript
PostgreSQL (projects, users, orgs, BOMs)
Redis (rate limiting, session cache)
Deployed on Cloud Run (Dockerfile already exists)
Auth: Auth0 or Firebase Auth (real, not mock)
Payments: Stripe (partially referenced in conversation history)
```

### Backend Tasks

#### Project & BOM Persistence
- `[ ]` Database schema: `users`, `organizations`, `projects`, `bom_entries`, `parts`, `messages`, `generated_images`, `activity_logs`
- `[ ]` `GET /api/projects` — list user's projects (replace `localStorage` index)
- `[ ]` `POST /api/projects` — create project
- `[ ]` `GET /api/projects/:id` — load project
- `[ ]` `PATCH /api/projects/:id` — update project metadata (name, requirements)
- `[ ]` `DELETE /api/projects/:id` — soft delete
- `[ ]` `GET /api/projects/:id/bom` — list BOM entries
- `[ ]` `POST /api/projects/:id/bom` — add part
- `[ ]` `PATCH /api/projects/:id/bom/:instanceId` — update part
- `[ ]` `DELETE /api/projects/:id/bom/:instanceId` — remove part
- `[ ]` `GET /api/projects/:id/messages` — conversation history
- `[ ]` `POST /api/projects/:id/messages` — append message

#### AI Proxy (move API key server-side)
- `[ ]` `POST /api/ai/architect` — proxy to Gemini, return architect response
- `[ ]` `POST /api/ai/hydrate` — part hydration with Google Search grounding
- `[ ]` `POST /api/ai/source` — find purchase links
- `[ ]` `POST /api/ai/audit` — technical + patent audit
- `[ ]` `POST /api/ai/enclosure` — OpenSCAD enclosure generation
- `[ ]` `POST /api/ai/assembly-plan` — generate assembly plan
- `[ ]` `POST /api/ai/generate-image` — Gemini image generation
- `[ ]` Rate limiting per user/plan tier (Redis token bucket)
- `[ ]` Usage metering for billing
- `[ ]` `POST /api/ai/ar-guidance` — AR frame analysis
- `[ ]` `POST /api/ai/voice-session` — bidirectional audio proxy for "Greasy Hands" voice mode (Gemini Live Audio)
- `[ ]` `POST /api/ai/vin-recall` — NHTSA + OEM bulletin lookup by VIN; returns recall list grounded to BOM entries
- `[ ]` `POST /api/ai/safety-audit` — ISO 26262 / ISO 8800 compliance check against BOM plan; returns structured violation report

#### Export Routes
- `[ ]` `GET /api/projects/:id/export/json` — current JSON manifest
- `[ ]` `GET /api/projects/:id/export/csv` — BOM as CSV
- `[ ]` `GET /api/projects/:id/export/pdf` — server-side PDF (Puppeteer or PDFKit)

#### Import Routes
- `[ ]` `POST /api/projects/import/json` — ingest a `.json` manifest
- `[ ]` `POST /api/projects/import/csv` — parse CSV BOM, hydrate via AI
- `[ ]` `POST /api/projects/import/paste` — AI parses free-text / pasted BOM

#### Auth & User Management
- `[ ]` Replace `UserService` mock with real Auth0/Firebase SDK calls
- `[ ]` JWT middleware on all API routes
- `[ ]` `POST /auth/session` — exchange auth token for session
- `[ ]` `GET /api/me` — return current user profile
- `[ ]` `PATCH /api/me` — update profile (name, avatar)
- `[ ]` Organization / team entity with invite flow

#### Sharing & Public Routes
- `[ ]` `GET /api/share/:username/:slug` — load a shared project (read-only)
- `[ ]` `POST /api/projects/:id/share` — generate a share link
- `[ ]` Public share renderer (SSR or static page at `/:username/:slug`)

#### Activity & Audit Logs
- `[ ]` Persist `ActivityLogService` entries to the database
- `[ ]` `GET /api/projects/:id/activity` — return log for project
- `[ ]` `GET /api/admin/activity` — org-level audit log (Team tier)

#### Digital Traceability Ledger _(Industrial / Roundtable)_
- `[ ]` Hash each BOM mutation and store an append-only provenance chain per project
- `[ ]` `GET /api/projects/:id/provenance` — return the cryptographically chained build record
- `[ ]` Export provenance chain as a signed JSON manifest (`.buildrecord` format)

#### Billing / Stripe Integration
- `[ ]` Stripe customer / subscription creation on signup
- `[ ]` Webhook handler for `invoice.paid`, `customer.subscription.deleted`
- `[ ]` Plan tier enforcement middleware (free: 3 projects, Pro: unlimited, etc.)
- `[ ]` Metered billing for AI usage (token counting already in `UserMessage.metadata.tokens`)
- `[ ]` `GET /api/billing/portal` — Stripe customer portal redirect
- `[ ]` `GET /api/billing/usage` — current billing period usage

---

## 🟢 Frontend: Improvements Needed

### Project Management
- `[ ]` Multi-device sync — projects currently live only in the current browser's `localStorage`
- `[ ]` Project search bar in `ProjectNavigator`
- `[ ]` Project sort options (last modified, name, part count)
- `[ ]` Proper project delete confirmation dialog (currently immediate with no undo)
- `[ ]` Project rename from the navigator (currently only editable in the header)
- `[ ]` Infinite scroll / pagination for large project lists

### BOM editor
- `[ ]` Inline editing in the BOM list (without opening the modal)
- `[ ]` Drag-to-reorder BOM entries
- `[ ]` Multi-select + bulk operations (bulk remove, bulk source)
- `[ ]` BOM entry sub-assembly nesting — `parentInstanceId` exists in `BOMEntry` but is never set or rendered hierarchically
- `[ ]` BOM entry categories / grouping view
- `[ ]` Filter BOM by sourcing status (all / sourced / pending / owned)
- `[ ]` Column sort in BOM (by price, by name, by category)

### Part Detail
- `[ ]` Edit price manually in the modal
- `[ ]` Edit SKU manually
- `[ ]` Edit ports/connectors manually
- `[ ]` Show port compatibility warnings between parts (ports are typed but never cross-checked in the UI)
- `[ ]` Datasheet link field

### Visualizer (Chilton)
- `[x]` Implement the `VisualManifest` renderer — `VisualManifestRenderer` component renders `VisualComponent[]` as an interactive SVG block diagram
- `[x]` Place the Visualizer **above the center panel** — block diagram renders side-by-side with ChiltonVisualizer in the hero area when manifest is populated
- `[x]` Port connection lines between components in the block diagram — dashed lines with arrowhead markers between adjacent blocks
- `[ ]` Pan / zoom on the block diagram
- `[x]` Click a component block to jump to its BOM entry — `onComponentClick` fires `setSelectedPart`
- `[ ]` Persistent image gallery — deleted IndexedDB images are lost; add server-side image storage

### Export / Import UI
- `[ ]` "Export as PDF" button — after backend is built
- `[ ]` "Export as CSV" button
- `[x]` "Import CSV" modal with column mapping — `BOMImportModal` component with auto-detected headers, plus paste-in tab
- `[x]` Drag-and-drop JSON/CSV file onto the app to import — `BOMImportModal` supports drag-and-drop CSV files

### Settings
- `[~]` `SettingsModal` exists but details are unknown without reading it
- `[ ]` API key management (user-provided key vs. server-managed)
- `[ ]` Default model selection per feature (Flash vs. Pro)
- `[ ]` Language / locale selection (i18n already wired via `react-i18next` and `i18n.ts`)
- `[ ]` Theme preference persistence to account (not just localStorage)
- `[ ]` Notification preferences

### Authentication UI
- `[ ]` Real Google/GitHub OAuth popup (not a 800ms fake delay)
- `[ ]` "Sign in to save your projects" prompt for anonymous users
- `[ ]` Logout confirmation + data export before account deletion

### Sharing
- `[ ]` Real shareable link that actually loads the project
- `[ ]` Embed code generator (iframe for sharing a read-only BOM)
- `[ ]` Share permissions (view-only vs. editable)

### Activity Log UI
- `[~]` Activity feed panel showing who did what, when — `ActivityLogService` now persists to IndexedDB; UI panel to consume logs not yet built
- `[ ]` Undo/redo from activity log

---

## 🔵 API: Public Developer API

For the Team tier's "API access" promise:

### REST API Design
- `[ ]` `POST /v1/projects` — create project programmatically
- `[ ]` `GET /v1/projects` — list projects
- `[ ]` `POST /v1/projects/:id/draft` — send a prompt, get BOM changes back
- `[ ]` `GET /v1/projects/:id/bom` — retrieve BOM as JSON
- `[ ]` `POST /v1/parts/hydrate` — hydrate a named part, return specs + pricing
- `[ ]` `POST /v1/parts/source` — find purchase links for a part name
- `[ ]` `GET /v1/projects/:id/export/csv` — BOM as CSV
- `[ ]` `GET /v1/projects/:id/export/pdf` — BOM as PDF
- `[ ]` OpenAPI / Swagger spec auto-generation
- `[ ]` API key issuance UI in dashboard
- `[ ]` API key rotation / revocation
- `[ ]` Rate limiting and quota enforcement per key
- `[ ]` Usage analytics dashboard (requests/day, tokens used)
- `[ ]` Webhook support: `project.updated`, `bom.changed`, `audit.completed`

---

## 🟣 Infrastructure & DevOps

- `[~]` **Dockerfile** — exists, targets Cloud Run.
- `[ ]` **Separate frontend and backend Dockerfiles** (currently one monolithic image)
- `[ ]` **CI/CD pipeline** (GitHub Actions: test → build → deploy to staging → promote to prod)
- `[ ]` **Environment management** — `.env` exists but not all secrets are documented
- `[ ]` **Database migrations** (e.g., Flyway, Prisma migrations, or Drizzle)
- `[ ]` **Secret management** — move API keys out of `.env` into Cloud Secret Manager or Vault
- `[ ]` **CDN / static asset hosting** for the marketing site (`website/`) separate from the app
- `[ ]` **Monitoring & alerting** — Sentry for errors, Cloud Monitoring for uptime
- `[ ]` **Playwright E2E test suite** — `playwright.config.ts` exists, `tests/` dir exists; expand coverage
- `[ ]` **Unit tests** for `DraftingEngine`, `UserService`, parser functions
- `[ ]` **Load testing** before public launch

#### Agentic Integrations
- `[ ]` **BuildSheet Skills Registry** — Package `DraftingEngine`, `geminiService` audit, and part hydration as Antigravity `.agent` skills; export a `skills.json` manifest from the project. _(Required for Antigravity platform demo)_

---

## 📋 Prioritized Quick Wins (Low Effort, High Impact)

These can be done without a backend and immediately improve quality/honesty:

1. `[x]` **Implement the VisualManifest block-diagram renderer** — `VisualManifestRenderer` renders interactive SVG schematic
2. `[x]` **Move Visualizer to top of center panel** — block diagram + image gallery in hero area
3. `[ ]` **"Greasy Hands" Voice Mode** — push-to-talk hands-free assistant via `gemini-2.5-flash-native-audio-preview` (audio model already referenced; wire up bidirectional audio session)
4. `[ ]` **Automotive Safety Auditor UI** — ISO 26262 / ISO 8800 violation panel (extends existing `audit` prompt; high demo value for industry audience)
5. `[ ]` **VIN & Recall lookup** — NHTSA API call + ground results to BOM frame/engine entries
6. `[x]` **CSV export** — `exportCSV()` in DraftingEngine + nav rail button
4. `[x]` **Project delete confirmation** — modal dialog with name confirmation
5. `[x]` **BOM sub-assembly nesting UI** — recursive tree renderer with collapse/expand, Set Parent in PartDetailModal
6. `[x]` **Port compatibility warnings** — cross-checks port specs/gender, shows warning badges + detail panel
7. `[x]` **PDF export** — print-optimized window via `window.print()` with styled BOM table
8. `[ ]` **Real Google OAuth** via Firebase Auth (free tier, minimal backend needed)
9. `[ ]` **Fix the share URL** — at minimum, encode the project as base64 in the URL query param so it actually loads
10. `[x]` **Persistent activity log** — `ActivityLogService` now writes to IndexedDB with 500-entry rolling cap

---

## ⚪ Deferred: Advanced Simulation _(Sweatlab / Future Sprint)_

These require specialized infrastructure not present in the base app. Deprioritized relative to conference demo scope.

- `[?]` **Local Thermal Simulation** — Agent-driven piston-to-wall clearance calculation. Requires a WebAssembly or server-side physics solver (e.g., Bullet, Matter.js).
- `[?]` **3D Point Cloud Fusion** — Convert workbench photos to an interactive 3D scene via NeRF / Gaussian splatting. Requires a dedicated ML inference pipeline.
- `[?]` **Omniverse/USD Export** — Export project to USD format for physics-based digital twin in NVIDIA Omniverse. Requires Omniverse SDK and a local or cloud simulation environment.

---

*Last updated: 2026-03-29. CRITICAL backlog pass: CSV/Paste BOM import, project search/duplication/archiving, VisualManifest block-diagram renderer, persistent activity logging, drag-and-drop import modal. Plus Industrial & Safety, Greasy Hands Voice Mode, BuildSheet Skills Registry, Digital Traceability Ledger, and deferred simulation features.*
