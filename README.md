# BuildSheet

**BuildSheet** is the first **AI-Native Hardware Architect** designed to bridge the gap between generative logic and physical manufacturing. It transforms natural language into validated Bill of Materials (BOM), manufacturing blueprints, and robotic assembly plans.

It is architected as a "Function-First" Agent, using cloud AI not just as a chatbot, but as a state-machine that manipulates a drafting board, validates engineering constraints, and orchestrates the supply chain.

## 🚀 Key Features

BuildSheet demonstrates the power of advanced multimodal vision AI models as the operating system for the physical world:

### 1. The "Robotics-ER" Engine (Advanced Vision AI)
*   **Kinematic Planning:** The system doesn't just list parts; it understands how they fit. It generates step-by-step **Robotic Assembly Plans**, calculating the required end-effectors (grippers), 6-DOF arm movements, and automation feasibility percentages.
*   **Context:** Located in the "Plan Assembly" workflow.

### 2. Legal & Patent Intelligence (Advanced Reasoning)
*   **Patent Risk Analysis:** During the "Verify System Integrity" phase, the model performs a deep reasoning pass to identify potential infringement risks against major utility patents (e.g., Apple MagSafe, Tesla thermal loops) based on the mechanical arrangement of the BOM.
*   **Safety & Compliance:** Automatically flags non-compliant voltage mismatches and safety hazards.

### 3. Supply Chain Orchestration (Search & Maps Grounding)
*   **AI Product Search:** The "Google Search Kit" modal and the "Search & Source" button run a **server-side** web product search via Gemini Google Search grounding. It returns structured purchase options (title, price, merchant, URL) grounded in real Google search results — no client-side keys.
*   **Shopping Graph:** The "Global Source" feature uses advanced search grounding to retrieve real-time pricing and stock status from the open web.
*   **Hyper-Local Sourcing:** The "Find Local" feature leverages maps grounding to geo-locate physical inventory nearby, supporting local businesses and reducing shipping latency.

### 3b. Anti-Blacklisting Guardrails
Google blacklists Gemini keys that are (a) used from the browser or (b) hit with bursts of grounding queries. BuildSheet enforces:
*   **Server-only keys:** All search/grounding runs server-side via `SEARCH_API_KEY` / `AI_KEY`; no search key ever reaches the browser or `localStorage`.
*   **Grounded-result cache:** Repeat part lookups are served from an in-memory TTL cache (`GOOGLE_SEARCH_CACHE_TTL_MS`, default 1h) and never re-hit Google.
*   **Rate limits + daily quota:** A dedicated `searchRateLimit` (20/min auth) and `searchQuota` (default 150/day/user) cap grounding volume. See `GOOGLE_SEARCH_DAILY_QUOTA`.

### 4. Manufacturing Data Engine (MDE) Bridge
*   **Visual Inspection AI:** The system acts as a Quality Engineer, analyzing component geometry to generate **Inspection Protocols** (JSON) compatible with cloud visual inspection AI, defining critical defect criteria before a single part is manufactured.

### 5. Self-Hosted AI & Local Model Routing
*   **Granular Model Selection:** Enterprise customers can route all AI generation tasks to self-hosted models via any OpenAI-compatible endpoint (LM Studio, Ollama, vLLM, SageMaker).
*   **5 configurable model slots:** Architect, Audit, Plan, CAD/Enclosure (e.g., Nemotron), and General Utility.
*   **Fallback chain:** Specific slot → Utility → Architect → Cloud AI.
*   **Search/grounding isolation:** Part search, local suppliers, and data hydration can use a separate API key (`SEARCH_API_KEY`), keeping generation and retrieval credentials decoupled.
*   **Zero-leakage guarantee:** When all local models are configured, no requests reach external APIs for generation tasks.

---

## 🏢 On-Premise Deployment (Coming Soon)

BuildSheet is designed for eventual fully air-gapped, on-premise deployment. See [`docs/ON_PREM_READINESS.md`](docs/ON_PREM_READINESS.md) for the full dependency audit and abstraction roadmap covering:

- Auth provider abstraction (OIDC/LDAP/AD)
- Storage backend abstraction (Postgres/REST)
- Billing bypass (`ENTERPRISE_MODE`)
- Internal parts catalog integration

---

## 🎯 Strategic Alignment: AI Futures Fund

**To the Judges of the AI Hackathon:**

BuildSheet represents the transition from the "Information Era" of AI to the **"Action Era"**.

### 1. The "AI as OS" Thesis
We are proving that advanced AI is not just a text processor, but a **Physics Engine**. By successfully modeling complex hardware interactions, sourcing real-world parts, and generating valid robotic G-code logic, we demonstrate that AI is ready to control the factory floor.

### 2. Democratizing Hardware & Job Creation
Hardware engineering historically has a massive "Knowledge Moat." BuildSheet lowers this barrier significantly.
*   **Micro-Manufacturing Renaissance:** By allowing a non-engineer to say "Build me a drone" and receiving a valid BOM, fabrication files, and assembly plan, we empower a new class of "Prompt Engineers for Physical Goods."
*   **Job Growth:** This tool does not replace engineers; it acts as a force multiplier. It shifts human labor from tedious sourcing and compatibility checking to high-value system architecture and innovation. More viable product designs = more manufacturing demand = **more physical jobs**.

### 3. Google Cloud Stickiness
BuildSheet is the "Top of Funnel" for the Google Industrial Cloud ecosystem:
*   Users design in **BuildSheet**.
*   Data exports to **Google Sheets** (Workspace).
*   Quality protocols deploy to **Vertex AI / Visual Inspection AI**.
*   Sourcing drives traffic via **Google Shopping**.

---

## 🛠 Architecture

BuildSheet follows a **backend-for-frontend** pattern: a React thin client communicates with a co-located Express.js API server. API keys and AI orchestration live exclusively on the server — nothing sensitive reaches the browser.

```
┌─────────────────────────────────────────────────────────┐
│  Docker Container (Cloud Run / local)                   │
│                                                         │
│  ┌──────────┐       ┌───────────────────────────────┐   │
│  │  nginx   │──/api/│  Express.js API Server (:8081)│   │
│  │  (:8080) │       │  • Firebase Admin Auth        │   │
│          │       │  • AI Orchestration (Cloud AI)  │   │
│  │  /       │       │  • Procurement Pipeline       │   │
│  │  → mktg  │       │  • Project CRUD (Firestore)   │   │
│  │          │       │  • Rate Limiting              │   │
│  │  /app/   │       └───────────────────────────────┘   │
│  │  → SPA   │                                           │
│  └──────────┘                                           │
└─────────────────────────────────────────────────────────┘
```

*   **Runtime:** Node.js 22 (React + Vite frontend, Express.js backend)
*   **Frontend:** React SPA with i18next (8 languages), locale-aware formatting
*   **Backend:** Express.js API server with Firebase Admin SDK
*   **Persistence:** Firestore (via server-side Admin SDK) + browser IndexedDB (images)
*   **AI Backend:** Cloud AI (default), or self-hosted OpenAI-compatible models
*   **API Security:** Firebase ID token verification; all AI keys server-side only

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `AI_KEY` | Yes* | Primary AI key (server-side only — never sent to browser) |
| `AI_PROVIDER` | No | `hosted` (Cloud SDK) or `on-prem` (OpenAI-compatible) |
| `AI_BASE_URL` | No | Base URL for OpenAI-compatible provider |
| `AI_IMAGE_BASE_URL` | No | Base URL for image generation API |
| `AI_DISPLAY_NAME` | No | Display name shown in UI for the AI service |
| `AI_MODEL_FAST` | No | Model for chat, sourcing, component ID |
| `AI_MODEL_SMART` | No | Model for audit, assembly planning, enclosures |
| `AI_MODEL_STRUCTURED` | No | Model for structured JSON extraction |
| `AI_MODEL_IMAGE` | No | Model for image generation |
| `AI_MODEL_AUDIO` | No | Model for AR guidance |
| `SEARCH_API_KEY` | No | Separate key for search/grounding (defaults to `AI_KEY`). Server-side only — never expose in the browser. |
| `GOOGLE_SEARCH_ENABLED` | No | Set `0` to disable Google Search grounding and force the verified procurement pipeline |
| `GOOGLE_SEARCH_CACHE_TTL_MS` | No | TTL for grounded-result cache (default `3600000` = 1h) |
| `GOOGLE_SEARCH_DAILY_QUOTA` | No | Per-user daily cap on grounding calls (default `150`) |
| `GOOGLE_SEARCH_VALIDATE_URLS` | No | Validate product URLs server-side before display (`0` disables) |
| `URL_VALIDATION_TIMEOUT_MS` | No | Per-request validation timeout ms (default `4000`) |
| `URL_VALIDATION_CACHE_TTL_MS` | No | TTL for URL-validation cache (default `1800000`) |
| `SEARXNG_BASE_URL` | No | SearXNG instance for procurement discovery |
| `FIRECRAWL_BASE_URL` | No | Firecrawl instance for web page extraction |
| `FIRECRAWL_API_KEY` | No | Firecrawl API key |
| `VITE_FIREBASE_*` | No | Firebase config (auth, Firestore, analytics) |
| `VITE_RECAPTCHA_SITE_KEY` | No | App Check (bot protection) |
| `VITE_STRIPE_*` | No | Stripe billing integration |

\* Not required if all models are configured locally via the Settings Modal.

### Routing
The nginx config supports dynamic sharing:
* **`/`** — Marketing website
* **`/app/`** — React SPA
* **`/api/v1/`** — Backend API server (proxied to Express on port 8081)
* **`/{username}/{slug}`** — Share links (fall through to SPA)

## Fact Verification System

BuildSheet includes a **Fact Verification System** that allows users to submit corrections and technical facts for admin review. This ensures the AI architect has access to accurate, source-attributed knowledge.

### Key Features

- **User Submissions**: Users can submit corrections via `POST /api/v1/architect/correct`
- **Admin Review**: Admins review and approve/reject corrections via `/api/v1/admin/corrections`
- **Firestore Storage**: Facts stored with confidence scoring and source attribution
- **Categorization**: 5 categories (component-specs, compatibility, requirements, procurement, general)

### Configuration

Set `ADMIN_UIDS` in `.env` with comma-separated Firebase user IDs:

```env
ADMIN_UIDS=firebase-user-id-1,firebase-user-id-2
```

See [`docs/FACT_VERIFICATION.md`](docs/FACT_VERIFICATION.md) for full documentation.

## Simulation Mode
If no API Key is provided, the app gracefully degrades into **Simulation Mode**, using a deterministic `MockService` to demonstrate the UI and logic flow without consuming API credits.

## 🌐 Internationalization

BuildSheet supports **8 languages** out of the box with auto-detection:
- 🇺🇸 English, 🇪🇸 Spanish, 🇧🇷 Brazilian Portuguese, 🇩🇪 German, 🇫🇷 French, 🇮🇳 Hindi, 🇰🇪 Swahili, 🇸🇦 Arabic (RTL)

Pricing is locale-aware via `formatPrice()` with 40+ locale→currency mappings.

## 📁 Project Structure

```
server/                     # Express.js API server (backend)
├── src/
│   ├── index.ts            # Entry point — Express app, Firebase Admin
│   ├── middleware/
│   │   ├── auth.ts         # Firebase ID token verification
│   │   └── rateLimit.ts    # Per-user rate limiting
│   ├── routes/
│   │   ├── architect.ts    # Chat (SSE streaming), verify, assembly plan
│   │   ├── sourcing.ts     # Find sources, hydrate, procurement pipeline
│   │   ├── generation.ts   # Image, fabrication, QA, enclosure, component ID
│   │   └── projects.ts     # CRUD: list, get, save, delete, archive, duplicate
│   └── services/
│       ├── cloudAiService.ts    # Server-side Cloud/OpenAI orchestration
│       ├── procurementEngine.ts # (Deprecated) Verified Procurement Pipeline
│       ├── aiServiceFactory.ts  # AI service creation from env vars
│       └── types.ts             # Server-side type definitions
services/                   # Frontend services (thin client)
├── apiClient.ts            # HTTP client with Firebase token auth + SSE
├── aiTypes.ts              # AIService interface (13 methods)
├── aiManager.ts            # Service factory + API key resolution
├── cloudAiService.ts       # Client-side AI service (delegates to server API)
├── hybridAiService.ts      # Router: local vs cloud with fallback chain
├── i18n.ts                 # 8-language translation bundles
├── locale.ts               # Locale-aware formatPrice() utility
├── parseUtils.ts           # Shared LLM response parsing
├── mockService.ts          # Offline simulation
└── ...
docs/
└── ON_PREM_READINESS.md    # On-prem deployment audit
tests/
├── marketing_site.spec.ts  # Marketing site E2E tests
├── settingsModal.spec.ts   # Settings UI tests
└── localModelRouting.spec.ts # Zero-leakage routing tests
```

## 🚀 Getting Started

### Prerequisites
- Node.js 22+
- An AI API key (`AI_KEY`)

### Development

```bash
# 1. Copy and fill in your environment variables
cp example.env .env

# 2. Install frontend dependencies
npm install

# 3. Install server dependencies
cd server && npm install && cd ..

# 4. Start the backend API server (terminal 1)
cd server && npm run dev

# 5. Start the frontend dev server (terminal 2)
npm run dev

# Frontend: http://localhost:3000/app/
# API:      http://localhost:8081/api/v1/health
```

### Docker (local)

```bash
./startup_local.sh    # Build & run container
./shutdown-local.sh   # Stop container
```

### Deploy to Cloud Run

```bash
./deploy.sh           # Build, push, deploy
```

## 🧪 Running Tests

BuildSheet has two test suites: server-side unit tests (Vitest) and end-to-end browser tests (Playwright).

### Server Unit Tests (Vitest)

Tests in `server/src/__tests__/` cover API routes, AI orchestration, and service logic.

```bash
cd server

# Run all unit tests once
npm test

# Run in watch mode (re-runs on file changes)
npm run test:watch

# Run with coverage report
npm run test:coverage
```

### End-to-End Tests (Playwright)

Tests in `tests/` cover the marketing site, SPA flows, settings modal, and local model routing. Playwright automatically starts the Vite dev server and a marketing site server before running.

```bash
# Install Playwright browsers (first time only)
npx playwright install --with-deps chromium

# Run all E2E tests
npx playwright test

# Run a specific test file
npx playwright test tests/settingsModal.spec.ts

# Run with the interactive UI
npx playwright test --ui

# Show the last HTML report
npx playwright show-report
```

> The E2E suite expects the backend to be running on port 8081. Start it first with `cd server && npm run dev`.