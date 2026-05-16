# BuildSheet — Strategic Notes & Recommendations

> Internal document covering improvements, security, performance, cost optimization, emerging market strategy, enterprise self-hosting positioning, and learn-from-scratch accessibility. Last updated: 2026-05-15

---

## 1. Technical Improvements

### 1.1 Pricing Rollout (Critical — Missing Today)

The entire pricing and billing infrastructure exists (`TierService`, Stripe integration, `useTier()` hook, plan limits per tier) but **the marketing website has no pricing page**. This is the single biggest gap between the current product and a launchable SaaS.

**Recommended action:**
- Add `/pricing` to `website/index.html` with a 3-column layout matching the existing `PLAN_LIMITS` schema: Free (3 projects, 10 messages/day), Pro ($15/month — full features), Enterprise (custom, self-host option).
- Gate Pro/Enterprise behind Stripe checkout OR, for on-prem, behind `ENTERPRISE_MODE=true`.
- Add annual billing option (discount 20%) — crucial for enterprise procurement cycles.

### 1.2 Server-Side API Completion

The `server/src/index.ts` routes exist (`architect`, `sourcing`, `generation`, `projects`, `shares`, `ai`) but the TODO.md lists ~40 REST endpoints that remain unimplemented (BOM CRUD, provenance ledger, audit logs, API key management, webhooks, real-time collaboration).

**Priority order for server completeness:**
1. `GET/POST/DELETE /api/v1/projects/*` (BOM CRUD — partially exists via Firestore, needs Postgres/SQLite adapter for on-prem)
2. JWT authentication on all routes (currently Firebase ID tokens only — need support for OIDC/OAuth tokens for enterprise)
3. Rate limiting per tier (Redis token bucket — currently none)
4. Usage metering (track AI calls per user/tier for billing)
5. OpenAPI/Swagger spec generation (auto-generate from route definitions using `@fastify/swagger`)

### 1.3 On-Prem Abstraction Gaps

The `ON_PREM_READINESS.md` documents the plan well but several implementations are still missing:

- **[ ] `ENTERPRISE_MODE` env var** — `TierService` hardcodes `localhost` detection but has no `ENTERPRISE_MODE` env var. Add it as a 1-hour fix: when true, force enterprise tier, disable Stripe UI, skip subscription listeners.
- **[ ] Auth provider abstraction** — `UserService` directly calls `signInWithPopup(GoogleAuthProvider)`. Abstract behind `AuthProvider` interface with OIDC adapter. This is the highest-priority on-prem item.
- **[ ] Storage backend abstraction** — `projects.ts` calls Firestore directly. Abstract behind `StorageBackend` interface with Postgres/SQLite adapters.
- **[ ] Search provider abstraction** — `searchService.ts` uses Gemini Google Grounding. Add `SearXNGProvider` and `InternalCatalogProvider` fallbacks.

### 1.4 Missing Features (Per TODO.md)

| Feature | Priority | Notes |
|---------|----------|-------|
| SSO / SAML | 🔴 Critical | Enterprise customers need this. Implement OIDC as MVP, SAML for legacy enterprise. |
| Shared workspaces | 🟡 High | No org-level project ownership exists. |
| Role-based access control | 🟡 High | Only "owner" role exists beyond mock. |
| Encryption at rest | 🟡 High | All data currently in plain text (localStorage, IndexedDB, Firestore). |
| Public REST API | 🟡 High | Advertised in Team tier, not implemented. |
| Real-time collaboration | 🟢 Medium | WebSockets + CRDT for concurrent editing. |
| SOC 2 compliance | 🟢 Medium | Infrastructure claim on website with no actual audit. |

---

## 2. Security Recommendations

### 2.1 Current Security Posture

| Area | Status | Risk Level |
|------|--------|------------|
| Server API keys stored server-side | ✅ Good | Low |
| Firebase Admin SDK server-side | ✅ Good | Low |
| Client-side AI calls (HybridAIService) | ⚠️ Leaves keys in browser | High |
| No rate limiting | ⚠️ Abuse vector | High |
| No API authentication on server routes | ⚠️ Anyone with URL can call | High |
| CORS restricted in dev, open in prod | ⚠️ Potential data exposure | Medium |
| No encryption at rest | ⚠️ Plain text data everywhere | High |
| No audit logs (server-side) | ⚠️ No visibility into API abuse | High |
| helmet CSP disabled | ⚠️ XSS vector | Medium |
| No input validation on AI endpoints | ⚠️ Prompt injection | Medium |

### 2.2 Immediate Hardening Actions

**Server-side (highest priority):**

1. **Add JWT/OIDC authentication middleware** — Every `/api/v1/*` route should verify an auth token before processing. Currently routes accept anonymous requests.

2. **Implement per-tier rate limiting** — Use Redis-backed token bucket:
   - Free: 10 requests/minute, 100/day
   - Pro: 60 requests/minute, 1000/day
   - Enterprise: configurable, rate-limited by contract

3. **Input validation** — Validate all AI inputs (max token count, sanitize base64 images, limit payload size). Prevent prompt injection attacks.

4. **Enable CSP headers** — `contentSecurityPolicy` is currently `false` in the helmet config. Enable with a restrictive policy:
   ```typescript
   contentSecurityPolicy: {
     directives: {
       defaultSrc: ["'self'"],
       scriptSrc: ["'self'", "'unsafe-inline'"],
       styleSrc: ["'self'", "'unsafe-inline'"],
       fontSrc: ["'self'", "data:"],
       connectSrc: ["'self'", "https://firestore.googleapis.com", "https://firebase.googleapis.com"],
       imgSrc: ["'self'", "data:", "blob:"],
     }
   }
   ```

5. **Server-side API key never reaches browser** — Currently `HybridAIService` in the client makes direct AI calls when a local provider isn't configured. Remove or make this opt-in with clear warnings.

**Client-side:**

6. **Strip client-side AI key exposure** — The `HybridAIService` reads `AI_KEY` from `window._env_` and makes direct AI calls. For production, all AI calls should route through the server. Only enable for local/offline scenarios with clear opt-in.

7. **Sanitize all user inputs** — BOM data, prompts, file uploads should be validated before passing to AI APIs (prevent prompt injection, buffer overflows, XSS).

### 2.3 Enterprise Security Requirements

For on-prem/enterprise deployments, add:

- **Data encryption at rest** — AES-256 for all stored data (Firestore, local storage, database). This is currently completely missing.
- **Audit logs** — All API calls, project modifications, user actions should be logged with user ID, timestamp, and action type.
- **SOC 2 documentation** — Even without a formal audit, document the infrastructure security posture: Google Cloud SOC 2 compliance, encryption in transit (HTTPS everywhere), access controls.
- **Data residency** — Allow enterprise customers to select their data region (us-central1, europe-west3, asia-southeast1). Firestore supports this.
- **Vulnerability scanning** — Add `npm audit` and container scanning (Trivy) to CI/CD pipeline.
- **CORS whitelist** — Allow enterprise customers to configure allowed origins.

---

## 3. Performance Optimizations

### 3.1 Client-Side

- **Bundle size optimization** — The app bundles Firebase SDK (~200KB minified), Three.js (~600KB), full React + ReactDOM (~60KB), plus all the BOM/assembly components. Consider:
  - Lazy loading the 3D viewers (OpenSCAD, STL, ChiltonVisualizer)
  - Code splitting the Visualizer components
  - Using Firebase modular SDK v10 (already done — good)
  - Tree-shaking unneeded Firebase modules (analytics, auth, firestore, storage can be individually imported)

- **Image handling** — Camera captures for AR and component identification generate large base64 images that are sent to AI APIs on every frame. Add:
  - Client-side image compression (resize to 1024px before encoding)
  - Progressive upload (thumbnail first, full res after confirmation)
  - WebP format instead of JPEG/PNG

- **IndexedDB pagination** — Large project lists should use cursor-based pagination, not loading all entries at once.

### 3.2 Server-Side

- **Caching layer** — Add Redis for:
  - Repeated part hydration results (same part name + category = cache hit)
  - AI response caching (deduplicate identical prompts within a TTL)
  - Session cache for active users
  - Rate limiter state storage

- **Connection pooling** — Firebase Admin SDK's Firestore client already pools connections, but verify the connection pool size is adequate for Cloud Run's maxScale (10).

- **Streaming responses** — The SSE streaming for architect chat is already implemented. Extend streaming to:
  - Audit results (incremental text output)
  - Assembly plan generation
  - Enclosure/EDR output

- **Async batch processing** — Heavy AI tasks (full audit of 50+ part BOM) should return immediately with a job ID, then complete asynchronously. This prevents 30-second timeouts on Cloud Run.

### 3.3 Network & CDN

- **Static asset CDN** — Serve the marketing website from a CDN (Cloud Front, Cloudflare) for global performance. The app itself should use a CDN for JS/CSS bundles.
- **Font self-hosting** — Already done (Material Symbols in `/app/fonts/`). Ensure all fonts are inlined or cached.
- **WebSocket proxy** — For real-time collaboration, configure nginx to proxy WebSocket upgrades to the Node API server.

---

## 4. Cost Optimization

### 4.1 AI Cost Management

The current setup uses Alibaba Cloud DashScope (Qwen models) which is already cost-effective. Key optimization strategies:

**Model routing strategy (already partially implemented):**
- **Fast tier** (qwen3.6-flash): Chat/conversation — cheapest, lowest latency
- **Smart tier** (qwen3.6-plus): Context-heavy queries — moderate cost
- **Structured tier** (qwen3.6-max): JSON output, validation, BOM specs — highest cost, use only when needed
- **Image tier** (wan2.6-t2i): Text-to-image — most expensive, use sparingly

**Recommendations:**

1. **Cache repeated queries** — If 5 users ask about "ESP32 WROOM" within an hour, the 5th query should return cached results. Add server-side caching with 1-hour TTL for part hydration results.

2. **Default to cheaper models** — For simple tasks (chat, basic queries), always use the "fast" model. Only escalate to "smart" or "structured" when the task requires complex reasoning or structured output.

3. **Local model priority** — The `HybridAIService` correctly routes to local models first. This is free and is the primary cost-saving mechanism. Encourage users to set up local models (Ollama, LM Studio) as the default path.

4. **Batch operations** — Audit 50 parts individually = 50 API calls. Batch them into a single prompt with a structured response = 1 API call. The `verifyDesign` endpoint already does this, but encourage batch mode.

5. **Token budget per tier** — Define per-user token budgets:
   - Free: 5000 tokens/day
   - Pro: 100,000 tokens/day
   - Enterprise: Unlimited (metered for reporting)

### 4.2 Infrastructure Cost (Cloud Run)

Current service.yaml specs:
- CPU: 1000m, Memory: 512MB
- Min scale: 1, Max scale: 10
- Container concurrency: 80
- Timeout: 300s (5 minutes)

**Cost estimates (Cloud Run):**
- 1 min-scale instance: ~$15/month (always-on)
- 10 max-scale burst: ~$30/month additional (burst only)
- Firestore: ~$0.06/100k reads, ~$0.15/100k writes
- AI (DashScope): ~$0.001-0.01 per 1K tokens depending on model

**Optimization recommendations:**

1. **Scale to zero when inactive** — If your deployment isn't 24/7 (e.g., it's a demo or internal tool), set `minScale: 0`. Cloud Run cold starts take ~5-15 seconds, which is acceptable for internal/demo use.

2. **Reduce maxScale for early stages** — If you have <10 concurrent users, `maxScale: 5` with `containerConcurrency: 80` handles 400 requests/minute. Increase maxScale only when you see requests queuing.

3. **Composite storage** — Firestore is expensive for write-heavy operations. For enterprise on-prem, SQLite is free and fast. For Cloud Run, consider PostgreSQL on Cloud SQL (much cheaper than Firestore for write-heavy workloads).

4. **Image storage** — Use Cloud Storage (nearline) for product images, 3D renderings, and audit screenshots. Archive old images after 90 days.

### 4.3 AI Cost by Feature (Per Use Case)

| Feature | Average Cost (per call) | Notes |
|---------|------------------------|-------|
| Chat (flash) | $0.001 - $0.005 | 2-3K tokens |
| Audit (max) | $0.01 - $0.05 | 10-50K tokens for full BOM |
| Enclosure (max) | $0.02 - $0.10 | Large context window |
| Image gen (wan2.6) | $0.05 - $0.15 | Per image, highest cost |
| Part hydration | $0.005 - $0.02 | 1-5K tokens |
| AR guidance | $0.002 - $0.01 | Short prompt, image input |
| Audio (ASR) | $0.005 - $0.02 | Per minute |

**Key insight:** Enclosure generation and image generation are the most expensive features. Consider:
- Quota limiting on image generation (free: 0, pro: 10/month, enterprise: unlimited)
- Local model fallback for enclosure (OpenSCAD generation — text model only)
- Batch pricing (10 image generations at $0.10 each = $1.00, same as 5 on-demand at $0.20 each — offer a 50% discount on bundles)

---

## 5. Emerging Markets Strategy

### 5.1 Target Markets

| Region | Opportunity | Key Considerations |
|--------|-------------|-------------------|
| **Southeast Asia** (Indonesia, Vietnam, Thailand, Philippines) | 🟢 High | Rapid electronics manufacturing growth, maker community expansion, mobile-first users |
| **India** | 🟢 High | Large maker/engineer population, price-sensitive, growing electronics manufacturing ecosystem |
| **Latin America** (Brazil, Mexico, Colombia) | 🟢 High | Growing manufacturing bases, Portuguese/Spanish language needs, lower purchasing power |
| **Africa** (Nigeria, Kenya, South Africa, Egypt) | 🟡 Medium | Growing maker movement, low connectivity, resource constraints |
| **Eastern Europe** (Ukraine, Poland, Romania, Serbia) | 🟢 High | Strong engineering culture, existing hardware startups, English fluency |

### 5.2 Product Adaptations for Emerging Markets

**1. Language Support (i18n)**

Already has `react-i18next` configured. Priority translations:
- **Hindi** (India's ~600M speakers)
- **Indonesian** (Indonesia's ~270M speakers)
- **Portuguese** (Brazil's ~215M speakers)
- **Spanish** (Latin America's ~500M speakers)
- **Vietnamese** (Vietnam's ~95M speakers)

**Translation strategy:**
- Use AI-assisted translation (Qwen models are multilingual natively) for first-pass translation of UI strings
- Partner with local maker communities for review
- Document: translate 20 core UI strings per sprint, prioritize dashboard and settings

**2. Affordability Model**

Stripe payments are limited. Alternative billing for regions where Stripe is unavailable or expensive:

- **Pay-per-credit system** — Instead of subscriptions, sell credits (e.g., 100 credits = 10 audits, 5 image generations, 50 chat messages). Credits can be purchased via:
  - UPI (India) — biggest payment method in India
  - GoPay/OVO/DANA (Indonesia)
  - Pix (Brazil) — instant, free transfers
  - Mobile money (M-Pesa in Kenya/Nigeria)
  - PayPal (widely available across emerging markets)

- **Prepaid card system** — Sell QR-code prepaid cards through local electronics shops, maker spaces, and universities. Card code redeemed in-app.

- **Institutional licensing** — Sell site licenses to universities, maker spaces, and government labs rather than individual subscriptions.

**3. Offline-First Architecture**

Emerging markets often have unreliable internet. The app should work offline with:

- **Local AI inference** — Encourage local model setup (Ollama on laptop with any GPU, or even CPU for small models). This is already partially implemented via `HybridAIService`.
- **Offline BOM editing** — Projects save to localStorage/IndexedDB when offline, sync to server when reconnected. Conflict resolution via last-write-wins or manual merge.
- **Downloadable model bundles** — For universities, distribute pre-built Ollama model bundles with the app.

**4. Mobile-First (Mobile Web)**

Many emerging market users primarily use mobile phones. Ensure the app works well on:
- 3G connections (optimize payload sizes, use progressive loading)
- Small screens (responsive design for BOM editing, chat interface)
- Limited storage (optimize IndexedDB usage, compress images)

**5. Hardware Local Sourcing**

The procurement pipeline already supports local suppliers via the sourcing API. For emerging markets:

- **Pre-populate regional vendor databases** — Partner with local distributors (LCSC/Seeed Studio for Asia, Scopus for India, DigiKey for Latin America).
- **Alternative part suggestions** — When a part isn't available locally, suggest regional equivalents (e.g., Chinese ESP32 variants instead of branded chips).
- **Customs/duty calculator** — Show estimated import duties and taxes for international procurement (important for India, Brazil, and other markets with high import taxes).

**6. Education & Maker Community Integration**

- **Partnerships with maker spaces** — Rooftop Lab (Bangkok), NID (India), Makerspace São Paulo, Make Kenya. Offer free institutional licenses in exchange for promotion and case studies.
- **University programs** — Create curriculum for engineering schools: "Design with BuildSheet" courses. Offer free pro tiers to students.
- **Local competitions** — Sponsor hardware hackathons and maker competitions. Provide BuildSheet as the primary tool for BOM creation.

---

## 6. Enterprise Self-Hosting

### 6.1 Value Proposition

> **"Your data, your infrastructure, your rules. BuildSheet runs on your servers with your AI models. Zero external dependencies required."**

Key selling points for enterprises:

1. **Zero external dependencies** — All AI, auth, storage, and search run on-premises. No calls to Google, Alibaba, or any third party once deployed.

2. **Compliance-ready** — SOC 2-compliant infrastructure, data residency controls, audit logs, encryption at rest.

3. **Customizable identity** — LDAP, Active Directory, Keycloak, Okta — integrate with whatever auth system the enterprise already has.

4. **Full feature parity** — Enterprise self-host gets the same features as cloud: unlimited projects, all exports, voice mode, AR guidance, full audit, provenance ledger.

5. **Audit trail** — Every action logged, every BOM mutation tracked, every AI query recorded.

### 6.2 On-Prem Deployment Options

**Option A: Docker Compose (SMB/Department)**
```yaml
# Simple 2-container setup for a single department
services:
  buildsheet:
    image: buildsheet:enterprise
    ports: ["80:8080"]
    env_file: .env
  postgres:
    image: postgres:16
    volumes: ["pgdata:/var/lib/postgresql/data"]
  ollama:
    image: ollama/ollama
    ports: ["11434:11434"]
  searxng:
    image: searxng/searxng
```

**Option B: Kubernetes (Large Enterprise)**
```yaml
# Full cloud-native deployment
deployments:
  - buildsheet (Frontend + API)
  - postgres (StatefulSet, persistent volumes)
  - redis (StatefulSet, memory-optimized)
  - ollama (GPU node pool, 1-8x A100/H100)
  - searxng (internal-only search)
  - keycloak (authentication)
```

**Option C: Single-Image (Maximum Simplicity)**
- Pre-build Docker image with SQLite, all AI models downloaded, nginx serving static assets.
- No external services required.
- Great for air-gapped environments (military, defense, classified).

### 6.3 On-Prem Configuration (from ON_PREM_READINESS.md)

```bash
# Core
ENTERPRISE_MODE=true
AUTH_PROVIDER=oidc
OIDC_ISSUER_URL=https://keycloak.internal.corp/realms/engineering
OIDC_CLIENT_ID=buildsheet

# AI — all local
LOCAL_ARCHITECT_URL=http://gpu-cluster.internal:8080/v1
LOCAL_ARCHITECT_MODEL=google/gemma-4-26b-a4b

# Search — internal parts catalog
SEARCH_PROVIDER=internal
INTERNAL_CATALOG_URL=http://parts-api.internal:3000

# No external calls
API_KEY=
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_MEASUREMENT_ID=
VITE_RECAPTCHA_SITE_KEY=
```

### 6.4 Go-to-Market for Enterprise

**Target personas:**
1. **CTO/CIO** — cares about security, compliance, data sovereignty
2. **Head of Engineering/Manufacturing** — cares about tool efficiency, BOM quality
3. **Procurement Director** — cares about cost savings, vendor management
4. **Compliance/Security Officer** — cares about audit trails, SOC 2, data residency

**Sales motions:**
- **Pilot program** — Free 90-day pilot for 50+ seat organizations. Includes onboarding, GPU cluster setup assistance, data migration.
- **Consulting engagement** — Custom OIDC/SAML integration, internal catalog API development, custom model fine-tuning.
- **Per-seat licensing** — $25-50/seat/year for full enterprise features. Volume discounts for 500+ seats.
- **Permanent license** — $50K-250K upfront, plus $10K/year maintenance, for air-gapped/military deployments.

**Marketing messaging:**
- "Your engineering data stays on your servers. Always."
- "SOC 2 Type II ready — not just claimed."
- "Deploy in 30 minutes. Configure in 30 seconds."
- "Works with your GPU cluster, your keycloak, your database."

---

## 7. Learn-from-Scratch Accessibility

### 7.1 Positioning BuildSheet as a Learning Platform

BuildSheet is uniquely positioned as a **learning tool** because it exposes every step of the engineering process:

1. **Transparent AI output** — All AI responses are shown as text (not hidden). Users can see exactly what the AI recommends and why.
2. **BOM as teaching tool** — The structured BOM format teaches component categorization, port compatibility, and bill of materials organization.
3. **Audit transparency** — When the AI catches issues in a BOM, it explains WHY. This is learning-by-correction.
4. **Enclosure generation** — OpenSCAD code is output directly, giving users working code they can study and modify.
5. **Assembly plans** — Step-by-step robotic assembly plans teach workflow decomposition.

### 7.2 Open-Sourcing Strategy

**Open-source the educational components:**
- **BOM schema** — Open-source the data model (`types.ts`) so anyone can build tools that understand BuildSheet's format.
- **Export formats** — JSON, CSV, PDF export code.
- **Parser utilities** — The `parseArchitectResponse()` function that converts LLM output to structured data.

**Keep proprietary:**
- AI model fine-tuning data (prompt templates, system prompts)
- The UI components (React components are fun to build but not the "secret sauce")
- Procurement pipeline (vendor APIs, pricing data)
- Search grounding results

**Recommended open-source components:**
1. `@buildsheet/bom-schema` — TypeScript types for the BOM data model
2. `@buildsheet/exporters` — JSON, CSV, PDF export utilities
3. `@buildsheet/validators` — Port compatibility checker, constraint validator
4. `@buildsheet/parse-utils` — LLM output parser (text → structured data)

### 7.3 Documentation as Product

**Tutorial content to create:**

1. **"Building Your First Project"** — Step-by-step video series: prompt → BOM → audit → enclosure → procurement
2. **"Understanding BOMs"** — Explainer on what a BOM is, why it matters, how to read one, how BuildSheet automates it
3. **"Hardware for Beginners"** — Dictionary of common components (resistors, capacitors, microcontrollers, sensors, motors, power supplies)
4. **"Port Compatibility Guide"** — Interactive diagram showing electrical/mechanical data port types and when to use each
5. **"Enterprise Deployment Guide"** — Step-by-step Docker/Kubernetes deployment, integration with Keycloak/Active Directory
6. **"Local AI Setup"** — How to set up Ollama/LM Studio/vLLM, which models work best for which tasks

### 7.4 Community Building

**Maker community engagement:**
- **Weekly BOM challenges** — "Build a robot arm that fits in a shoebox" — users submit BOMs, community votes, AI audits the best.
- **Open-source project library** — Users can share their projects as templates. "Open a project" = others can import and study the BOM.
- **BuildSheet Skills** — Package `DraftingEngine`, `audit`, and `hydration` as Antigravity `.agent` skills. This is a unique way to make BuildSheet's capabilities discoverable and reusable.
- **University partnerships** — "Design with BuildSheet" curriculum for engineering schools. Free pro tier for students, free site license for institutions.

### 7.5 API for Developers

**Public REST API** (Team tier) enables:
- Programmatic BOM creation from CI/CD pipelines
- Automated procurement tracking (pull pricing data via API)
- Integration with ERP/MRP systems
- Custom dashboards and reporting
- Webhook triggers for events (BOM changed, audit completed)

**Developer onboarding:**
- OpenAPI spec (auto-generated from route definitions)
- Postman collection (pre-built requests for every endpoint)
- SDKs in TypeScript, Python, and Go (community-driven)
- API playground (interactive API testing in the web app)

---

## 8. Summary — Priority Matrix

| Area | Priority | Effort | Impact |
|------|----------|--------|--------|
| **Pricing page on website** | 🔴 Critical | Low (2 hours) | High — blocks launch |
| **ENTERPRISE_MODE env var** | 🔴 Critical | Low (1 hour) | High — blocks on-prem sales |
| **Auth provider abstraction** | 🔴 Critical | Medium (2 days) | High — required for enterprise |
| **Server API authentication** | 🔴 Critical | Low (4 hours) | High — security risk |
| **Rate limiting** | 🔴 Critical | Low (4 hours) | High — abuse prevention |
| **Encryption at rest** | 🟡 High | Medium (3 days) | High — enterprise requirement |
| **Storage backend abstraction** | 🟡 High | Low (1 day) | Medium — makes on-prem easier |
| **PostgreSQL adapter** | 🟡 High | Medium (5 days) | Medium — cheaper than Firestore long-term |
| **OpenAPI spec + SDKs** | 🟡 High | Medium (5 days) | Medium — developer adoption |
| **Language translations** | 🟡 High | Low (1 week) | High — emerging market access |
| **Payment alternatives (UPI/Pix)** | 🟡 High | High (2 weeks) | High — emerging market access |
| **SOC 2 documentation** | 🟢 Medium | Low (3 days) | Medium — enterprise credibility |
| **Bundle pricing for AI** | 🟢 Medium | Low (1 day) | Medium — cost predictability |
| **Offline-first mode** | 🟢 Medium | Medium (5 days) | Medium — emerging market access |
| **Tutorials & documentation** | 🟢 Medium | High (ongoing) | Medium — adoption driver |
| **Open-source SDK packages** | 🟢 Medium | Medium (2 weeks) | Medium — ecosystem growth |

---

*This document is a living reference. Update priorities and estimates as features ship and market conditions change.*
