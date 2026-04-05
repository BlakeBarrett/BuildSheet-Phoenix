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
**Current**: `draftingEngine.ts` stores projects in both `localStorage` + Firestore (for authenticated users). Uses `firebase/firestore` for CRUD, real-time sync, and cloud backup.

**On-prem impact**: Firestore requires Google Cloud connectivity. Without it, you fall back to localStorage-only — which works but has a 5MB quota limit and no cross-device sync.

**Recommended approach**:
- Abstract `draftingEngine.ts` storage behind a `StorageBackend` interface:
  ```ts
  interface StorageBackend {
    save(id: string, data: DraftingSession): Promise<void>;
    load(id: string): Promise<DraftingSession | null>;
    delete(id: string): Promise<void>;
    listAll(): Promise<ProjectIndexEntry[]>;
  }
  ```
- Implement backends: `FirestoreBackend` (current), `PostgresBackend` (REST API), `LocalStorageBackend` (current fallback)
- IndexedDB via `idb-keyval` is already used for image storage — this is local and fine for on-prem

> [!WARNING]
> Firestore is also used by `TierService` to read custom tier overrides (`customers/{uid}/tier`). This would need its own abstraction or simply be replaced by an env-var/config-file approach for on-prem.

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

#### 4. Google Search Grounding (findPartSources, findLocalSuppliers, hydratePartDetails)
**Current**: Uses `@google/genai` SDK with `googleSearch` and `googleMaps` tools. Requires Gemini API key.

**On-prem impact**: These functions make requests to `generativelanguage.googleapis.com`. In a fully air-gapped network, they won't work.

**Recommended approach**:
- Already abstracted with `SEARCH_API_KEY` ✅
- For air-gapped: implement a `SearchProvider` interface:
  ```ts
  interface SearchProvider {
    findPartSources(query: string, context?: string): Promise<ShoppingOption[]>;
    findLocalSuppliers(query: string): Promise<LocalSupplier[]>;
    hydratePartDetails(name: string, category: string): Promise<Partial<Part>>;
  }
  ```
- Backends: `GeminiSearchProvider` (current), `VertexAIProductsProvider` (future), `InternalCatalogProvider` (on-prem — queries customer's own parts database via REST)
- For MVP on-prem: these functions can return `null` gracefully (UI already handles this)

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
| 2 | **Storage Backend Abstraction** | Medium | 🔴 Critical | `StorageBackend` interface + Postgres/REST adapter |
| 3 | **Billing Bypass** | Low | 🟢 Easy | `ENTERPRISE_MODE=true` env var → force enterprise tier |
| 4 | **Search Provider Abstraction** | Medium | 🟡 Nice-to-have | `SearchProvider` interface, graceful `null` for MVP |
| 5 | **Analytics Disable** | Trivial | 🟢 Already done | Omit `VITE_FIREBASE_MEASUREMENT_ID` |
| 6 | **App Check Disable** | Trivial | 🟢 Already done | Omit `VITE_RECAPTCHA_SITE_KEY` |
| 7 | **Google Fonts** | N/A | ✅ Not applicable | Marketing site only, not in the app |

## Recommended Implementation Order

1. **`ENTERPRISE_MODE` env var** — 1 hour. Bypasses Stripe, forces enterprise tier, skips Firebase subscription listeners. Immediate value.
2. **Auth Provider Interface** — 1-2 days. Abstract `UserService`, implement OIDC adapter. Required for any real Enterprise deployment.
3. **Storage Backend Interface** — 1-2 days. Abstract `draftingEngine.ts` persistence, implement REST/Postgres backend. Required for multi-user on-prem.
4. **Search Provider Interface** — 1 day. Already partially done with `SEARCH_API_KEY`. Full abstraction for internal parts catalog integration.

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
