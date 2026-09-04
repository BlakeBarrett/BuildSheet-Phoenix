# BuildSheet On-Prem Readiness Audit

A comprehensive analysis of every external dependency that would need to be addressed for a fully air-gapped Enterprise deployment.

---

## Current External Dependencies

### ✅ Already Handled

| Dependency | Status | Notes |
|------------|--------|-------|
| **AI Generation** (chat, audit, plan, CAD, utility) | ✅ Abstracted | Routes to self-hosted models via OpenAI-compatible API |
| **Search API Key** | ✅ Abstracted | Separate `SEARCH_API_KEY` for grounding operations |
| **Icon Fonts** | ✅ Self-hosted | Material Symbols loaded from `/app/fonts/material-symbols-rounded.woff2` |
| **Docker/Nginx** | ✅ Ready | Already containerized, nginx serves static assets |
| **Backend API Server** | ✅ Ready | Express.js server co-located in container, all AI keys server-side |
| **Project CRUD** | ✅ Server-side | Firestore access via Firebase Admin SDK on the server |

---

### 🔴 Blocking for On-Prem

#### 1. Firebase Auth
**Current**: Google Sign-In and email-link auth via `firebase/auth` → `firebaseapp.com`

**On-prem impact**: Requires internet connectivity to Google's auth servers.

**Recommended approach**:
- Abstract `UserService` behind an `AuthProvider` interface
- Implement an **LDAP/OIDC adapter** — most Enterprise customers have Active Directory, Okta, or Keycloak
- The guest fallback already works without Firebase (localStorage-based anonymous session), so the app is functional without auth today
- Add an `AUTH_PROVIDER` env var: `firebase` (default) | `oidc` | `ldap` | `none`

> [!IMPORTANT]
> This is the **highest-priority** abstraction for on-prem. Every Enterprise customer will have their own identity provider.

---

#### 2. Firestore (Project Persistence)
**Current**: Project CRUD now runs server-side via `server/src/routes/projects.ts`, using Firebase Admin SDK. The client calls the backend API (`/api/v1/projects/*`) instead of using the Firestore client SDK directly.

**On-prem impact**: Firestore still requires Google Cloud connectivity. However, since all persistence is now behind the server API, swapping the storage backend is **much simpler** — only the server route handlers need to change, not the client.

**Recommended approach**:
- Abstract the project routes' Firestore calls behind a `StorageBackend` interface on the server:
  ```ts
  interface StorageBackend {
    save(uid: string, id: string, data: any): Promise<void>;
    load(uid: string, id: string): Promise<any | null>;
    delete(uid: string, id: string): Promise<void>;
    listAll(uid: string): Promise<any[]>;
  }
  ```
- Implement backends: `FirestoreBackend` (current), `PostgresBackend`, `SQLiteBackend` (air-gapped)
- IndexedDB via `idb-keyval` is still used client-side for image blob storage — this is local and fine for on-prem

> [!NOTE]
> The server-side architecture makes this abstraction significantly easier than the previous client-side approach. Only one file (`projects.ts`) needs to change.

---

#### 3. Stripe Billing
**Current**: `stripeCheckout.ts` and `tierService.ts` use the Invertase Firebase Stripe extension to manage subscriptions.

**On-prem impact**: No internet → no Stripe. But also: **on-prem Enterprise customers don't need Stripe at all** — they're paying via invoice/PO, not self-service checkout.

**Recommended approach**:
- `TierService` already has a localhost short-circuit that forces `enterprise` tier
- Add an `ENTERPRISE_MODE=true` env var that:
  1. Forces `enterprise` tier (skip Stripe entirely)
  2. Disables the checkout UI
  3. Skips Firebase subscription listeners
- **No code abstraction needed** — just a feature flag to bypass billing entirely

---

#### 4. Google Search Grounding & Procurement Pipeline
**Current**: Sourcing and procurement now run **server-side** via `server/src/routes/sourcing.ts`. The pipeline exclusively uses Gemini's native Google Grounding Search API. All keys live server-side (`SEARCH_API_KEY` / `AI_KEY`), and grounding volume is guarded by a TTL result cache (`GOOGLE_SEARCH_CACHE_TTL_MS`), a per-minute rate limit, and a per-user daily quota (`GOOGLE_SEARCH_DAILY_QUOTA`) to prevent API-key throttling/blacklisting. Set `GOOGLE_SEARCH_ENABLED=0` to bypass Google entirely.

**On-prem impact**: The Gemini Search Grounding functions require `generativelanguage.googleapis.com`. This functionality is **not available** in strictly air-gapped environments.

**Recommended approach**:
- If internet access is available, use the default `SearchService` which leverages Gemini Google Grounding.
- For strictly air-gapped deployments, sourcing features will fallback to returning empty results unless a custom local search provider is integrated into `server/src/services/searchService.ts`.
- For internal parts catalog: implement a `SearchProvider` interface:
  ```ts
  interface SearchProvider {
    findPartSources(query: string, context?: string): Promise<ShoppingOption[]>;
    findLocalSuppliers(query: string): Promise<LocalSupplier[]>;
    hydratePartDetails(name: string, category: string): Promise<Partial<Part>>;
  }
  ```
- Backends: `GeminiSearchProvider` (current), `SearXNGProvider` (self-hosted), `InternalCatalogProvider` (on-prem — queries customer's own parts database via REST)
- For MVP on-prem: these functions return `null` gracefully (UI already handles this)

---

#### 5. Firebase Analytics
**Current**: `firebase/analytics` with `measurementId`. Sends usage data to Google Analytics.

**On-prem impact**: Sends data to `google-analytics.com` — privacy concern for air-gapped customers.

**Recommended approach**:
- Already conditional: only initializes if `measurementId` is present
- Add `DISABLE_ANALYTICS=true` env var
- For on-prem, simply omit `VITE_FIREBASE_MEASUREMENT_ID` from the env config (this already works!)

---

#### 6. Firebase App Check (reCAPTCHA)
**Current**: `VITE_RECAPTCHA_SITE_KEY` in env config. Used for bot protection.

**On-prem impact**: reCAPTCHA phones home to Google. Not needed in a private network.

**Recommended approach**: Omit the env var — already fails gracefully when not configured.

---

### 🟡 Website-Only (Not in the App)

#### 7. Google Fonts (Marketing Website Only)
**Current**: `website/index.html` loads Inter and Plus Jakarta Sans from `fonts.googleapis.com`.

**On-prem impact**: The marketing website is **not** the app. On-prem customers would run the app container, not the marketing site. **No action needed.**

The app itself (`index.html`) already self-hosts its icon font.

---

## Summary: On-Prem Deployment Checklist

| # | Item | Effort | Priority | Approach |
|---|------|--------|----------|----------|
| 1 | **Auth Provider Abstraction** | Medium | 🔴 Critical | `AuthProvider` interface + OIDC/LDAP adapter |
| 2 | **Storage Backend Abstraction** | Low | 🟡 Simplified | Server-side only: swap `projects.ts` Firestore calls → Postgres/SQLite |
| 3 | **Billing Bypass** | Low | 🟢 Easy | `ENTERPRISE_MODE=true` env var → force enterprise tier |
| 4 | **Search Provider Abstraction** | Low | 🟡 Partially done | SearXNG/Firecrawl already self-hostable via env vars |
| 5 | **Analytics Disable** | Trivial | 🟢 Already done | Omit `VITE_FIREBASE_MEASUREMENT_ID` |
| 6 | **App Check Disable** | Trivial | 🟢 Already done | Omit `VITE_RECAPTCHA_SITE_KEY` |
| 7 | **Google Fonts** | N/A | ✅ Not applicable | Marketing site only, not in the app |
| 8 | **Backend API Server** | N/A | ✅ Already done | All AI keys server-side, co-located in container |
| 9 | **Project CRUD** | N/A | ✅ Already done | Server-side Firestore via Admin SDK |

## Recommended Implementation Order

1. **`ENTERPRISE_MODE` env var** — 1 hour. Bypasses Stripe, forces enterprise tier, skips Firebase subscription listeners. Immediate value.
2. **Auth Provider Interface** — 1-2 days. Abstract `UserService`, implement OIDC adapter. Required for any real Enterprise deployment.
3. **Storage Backend Interface** — 1 day. Now server-side only: swap Firestore calls in `server/src/routes/projects.ts` with Postgres/SQLite adapter. Much simpler than the previous client-side approach.
4. **Search Provider Interface** — 0.5 day. SearXNG and Firecrawl are already self-hostable. For internal catalog, implement a REST adapter.

## env.sh for On-Prem Deployment

```sh
# Core (no Firebase, no Stripe, no Google)
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
API_KEY=                            # empty — not needed
VITE_FIREBASE_API_KEY=              # empty — not needed
VITE_FIREBASE_MEASUREMENT_ID=      # empty — analytics disabled
VITE_RECAPTCHA_SITE_KEY=           # empty — app check disabled
```
