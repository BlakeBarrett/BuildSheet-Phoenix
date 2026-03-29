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
- `[ ]` Multimodal interface to upload images of physical components alongside natural language prompts
- `[ ]` AI identification and condition reporting of mechanical components

### 2. BOM Lifecycle Management
- `[x]` Add/Remove/Edit for BOM entries
- `[x]` Manual edits trigger Architect re-validation (constraint check)
- `[ ]` Sub-assembly nesting — `parentInstanceId` exists in `BOMEntry` but is never set or rendered hierarchically
- `[ ]` Undo/redo for BOM changes

### 3. Kinematic-to-CAD Bridge
- `[~]` OpenSCAD generation pipeline (`generateEnclosure` in `geminiService.ts`) — basic implementation exists
- `[ ]` In-app OpenSCAD viewer / preview
- `[ ]` Export `.scad` file directly from BOM entry
- `[ ]` STL preview via Three.js or similar

### 4. Legacy Manual Archaeology (PDF Ingestion)
- `[?]` Pipeline to ingest and verify structural/mechanical data from 1970s PDF service manuals
- `[?]` Extract parts from scanned documents and map them to BOM entries

---

## 🔴 CRITICAL: Features Promised on the Marketing Website — Not Yet Built

These are features the `website/index.html` explicitly advertises that are **not yet functional** in the actual app (`App.tsx`).

### Export
- `[~]` **JSON export** — `exportManifest()` works and downloads a `.json` file.
- `[ ]` **PDF export** — advertised on the Pro tier and in the FAQ ("PDF exports clean enough for vendor RFQs"). No PDF generation exists anywhere in the codebase.
- `[ ]` **CSV / Excel export** — advertised on the Pro tier. Not implemented.
- `[ ]` **BOM import from CSV** — advertised in the FAQ ("You can import existing BOMs from CSV"). No import logic exists at all.
- `[ ]` **Paste-in BOM import** — also advertised in FAQ. Not implemented.

### Project Management
- `[~]` **Project list / history** — `ProjectNavigator` shows local projects stored in `localStorage`. Limited to the current browser/device.
- `[ ]` **Project search and filtering**
- `[ ]` **Project tags / labels**
- `[ ]` **Project archiving**
- `[ ]` **Project duplication** — `forkFromMessage` exists but only forks from a message snapshot, not at the project level.
- `[ ]` **Project templates** — suggested in marketing copy.
- `[ ]` **Project thumbnail generation** — thumbnails are explicitly disabled (`thumbnail: undefined // DISABLE THUMBNAILS to save space in the index`).

### Visual Assembly View (the Chilton Visualizer)
- `[~]` **AI-generated concept image** — `ChiltonVisualizer` shows Gemini-generated PNG images. This is a flat image, not an interactive assembly.
- `[ ]` **The "Visualizer" panel shown in the hero mockup** — the `VisualManifest` type (`stackAxis`, `VisualComponent[]`) exists in `types.ts` but is **never populated or rendered**. The 3D/schematic block-diagram visualizer from the mockup is missing entirely.
- `[ ]` **Interactive explorable visualization** — advertised as "See how every part connects, trace dependencies." The current image viewer has no interactivity beyond pan/zoom.
- `[ ]` **Dependency graph / port-connection diagram** — ports are modelled in `PortDefinition` but never visualized beyond a list in `PartDetailModal`.

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
- `[ ]` **Commenting / annotation on build sheets**
- `[ ]` **Real-time collaborative editing** (implied by "Collaborate" feature card)

### Data Security (advertised in FAQ)
- `[ ]` **Encryption at rest** — all data is in plain `localStorage` / IndexedDB. No encryption.
- `[ ]` **SOC 2 compliance** — advertised. N/A without a real backend.
- `[ ]` **Audit logs** — `ActivityLogService` exists (`activityLogService.ts`) but only logs to memory with no persistence or UI.
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
- `[ ]` Implement the `VisualManifest` renderer — render `VisualComponent[]` as a schematic block diagram (SVG or Canvas), not just an AI-generated image
- `[ ]` Place the Visualizer **above the center panel** (as shown in the hero mockup — it currently sits only in the left/draft pane)
- `[ ]` Port connection lines between components in the block diagram
- `[ ]` Pan / zoom on the block diagram
- `[ ]` Click a component block to jump to its BOM entry
- `[ ]` Persistent image gallery — deleted IndexedDB images are lost; add server-side image storage

### Export / Import UI
- `[ ]` "Export as PDF" button — after backend is built
- `[ ]` "Export as CSV" button
- `[ ]` "Import CSV" modal with column mapping
- `[ ]` Drag-and-drop JSON/CSV file onto the app to import

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
- `[ ]` Activity feed panel showing who did what, when
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

---

## 📋 Prioritized Quick Wins (Low Effort, High Impact)

These can be done without a backend and immediately improve quality/honesty:

1. `[ ]` **Implement the VisualManifest block-diagram renderer** — the type already exists, just needs a renderer
2. `[ ]` **Move Visualizer to top of center panel** to match the hero mockup
3. `[ ]` **CSV export** — pure frontend, trivial to implement from existing BOM data
4. `[ ]` **Project delete confirmation** — currently instant with no undo
5. `[ ]` **BOM sub-assembly nesting UI** — `parentInstanceId` already exists, just needs a recursive renderer
6. `[ ]` **Port compatibility warnings** — cross-check `PortDefinition[]` between parts in the BOM and flag mismatches
7. `[ ]` **PDF export** — use `window.print()` with a print stylesheet as a fast stopgap before server-side PDF
8. `[ ]` **Real Google OAuth** via Firebase Auth (free tier, minimal backend needed)
9. `[ ]` **Fix the share URL** — at minimum, encode the project as base64 in the URL query param so it actually loads
10. `[ ]` **Persistent activity log** — write to IndexedDB alongside images

---

*Last updated: 2026-03-28. Reflects gap analysis of `App.tsx` (v1581 lines), `types.ts`, `services/`, `components/`, and `website/index.html`.*
