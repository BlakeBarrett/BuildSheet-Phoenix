# Refactor Grounding Search to Backend

Move all Google Search grounding / sourcing logic from the client-side `AIService` to the Express backend, making the client a pure UI that receives fully-formed, UI-ready JSON.

## Problem

The client currently calls the Gemini SDK **directly from the browser** (`@google/genai` in `services/cloudAiService.ts`). This:

1. **Gets flagged as bot traffic** — browser requests to Google Search Grounding originate from residential IPs with browser User-Agents, which triggers abuse detection
2. **Exposes the API key** — the Gemini key is embedded in the client bundle via `VITE_` env vars
3. **No rate control** — each user's browser fires requests independently with no coordination
4. **Duplicates logic** — the server already has `ServerCloudAIService` with the same methods, but the client still has its own copy calling Google directly

## Current Architecture

```
Client (Browser)                         Server (Express)
─────────────────                        ─────────────────
ServiceContext                           /api/v1/sourcing/*
  → CloudAIService                         → ServerCloudAIService
    → @google/genai (DIRECT)                  → @google/genai
    → findPartSources()                       → findPartSources()
    → hydratePartDetails()                    → hydratePartDetails()
    → findLocalSuppliers()                    → findLocalSuppliers()
```

The client **never actually uses** `sourcingApi` from `apiClient.ts` for search grounding. Instead, `App.tsx` calls `aiService.findPartSources()` → `CloudAIService.findPartSources()` → direct Gemini SDK from the browser.

## Proposed Architecture

```
Client (Browser)                         Server (Express)
─────────────────                        ─────────────────
App.tsx                                  /api/v1/sourcing/*
  → sourcingApi.find()  ──HTTP──►          → SearchService
  → sourcingApi.hydrate() ──HTTP──►           → @google/genai
  → sourcingApi.local() ──HTTP──►             → request jitter (200-700ms)
                                              → batch chunking (5 per batch)
                                              → noisy-domain filtering
                                              → confidence scoring
                                              → UI-ready JSON response
```

> [!IMPORTANT]
> **Breaking change for client-side AI services**: After this refactor, the client-side `CloudAIService`, `HybridAIService`, and `MockService` will no longer need search/grounding methods. These methods will be removed from the `AIService` interface. All search operations will go exclusively through the server API.

## Open Questions

> [!IMPORTANT]
> **On-Prem mode**: The `on-prem` provider currently uses OpenAI-compatible endpoints for search (no Google Grounding). Should on-prem search also route through the server? Currently the server's `ServerCloudAIService` supports on-prem. I'll route it through the server for consistency, but wanted to confirm.

> [!NOTE]
> **Service Account auth**: The task spec mentions replacing API keys with Google Service Account auth (`X-Goog-User-Project` header). The current server already uses API keys via `@google/genai`. Switching to Service Account (ADC) is a separate config change — should I implement it now, or leave it as a follow-up after the routing refactor is stable?

## Proposed Changes

### Server: Search Service

#### [NEW] [searchService.ts](file:///home/blake/Src/blakebarrett/BuildSheet-Phoenix/server/src/services/searchService.ts)

Centralized search service wrapping `ServerCloudAIService` with:
- **Request jitter**: Random 200-700ms delay between API calls to avoid burst patterns
- **Batch chunking**: `searchBatch(queries[])` groups into chunks of 5 with jitter between chunks
- **User-Agent**: Sets `BuildSheet-Server/1.0 (+https://buildsheet.cloud)` on outgoing requests
- **Result normalization**: All responses return UI-ready `ShoppingOption[]` — no parsing on the client
- **Grounding metadata**: Adds `groundedAt: ISO string`, `sourceUrl` to each result

---

#### [MODIFY] [sourcing.ts](file:///home/blake/Src/blakebarrett/BuildSheet-Phoenix/server/src/routes/sourcing.ts)

- Add `POST /api/v1/sourcing/batch` endpoint for multi-part search in one call
- Use `SearchService` instead of calling `ai.findPartSources()` directly
- Ensure all responses are fully-formed, UI-ready JSON

---

### Client: Rewire to Server API

#### [MODIFY] [App.tsx](file:///home/blake/Src/blakebarrett/BuildSheet-Phoenix/App.tsx)

- `handleSourcePart()` (line ~2280): Replace `aiService.findPartSources()` → `sourcingApi.find()`
- `handleHydratePart()` (line ~2325): Replace `aiService.hydratePartDetails()` → `sourcingApi.hydrate()`
- `hydrateAllVirtualParts()` (line ~2351): Replace batch of `aiService.hydratePartDetails()` → `sourcingApi.hydrate()` in sequence with server-side batching
- `findLocalSuppliers` calls: Replace → `sourcingApi.local()`
- Remove dependency on `aiService` for all search/sourcing operations

---

#### [MODIFY] [aiTypes.ts](file:///home/blake/Src/blakebarrett/BuildSheet-Phoenix/services/aiTypes.ts)

- Remove `findPartSources?`, `findLocalSuppliers?`, `hydratePartDetails?` from `AIService` interface
- These are now server-only operations

---

#### [MODIFY] [cloudAiService.ts](file:///home/blake/Src/blakebarrett/BuildSheet-Phoenix/services/cloudAiService.ts)

- Remove `findPartSources()`, `findLocalSuppliers()`, `hydratePartDetails()` methods
- Remove `getSearchClient()`, `getSearchApiKey()` methods
- Remove `@google/genai` `GroundingSupport` import and `buildChunkConfidenceMap()` helper
- Remove `NOISY_DOMAINS`, `NOISY_URL_PATTERNS` filters (now server-only)

---

#### [MODIFY] [hybridAiService.ts](file:///home/blake/Src/blakebarrett/BuildSheet-Phoenix/services/hybridAiService.ts)

- Remove `findPartSources()`, `findLocalSuppliers()`, `hydratePartDetails()` delegation methods

---

#### [MODIFY] [mockService.ts](file:///home/blake/Src/blakebarrett/BuildSheet-Phoenix/services/mockService.ts)

- Remove `findPartSources()`, `findLocalSuppliers()`, `hydratePartDetails()` mock implementations

---

### Tests

#### [NEW] [searchService.test.ts](file:///home/blake/Src/blakebarrett/BuildSheet-Phoenix/server/src/__tests__/searchService.test.ts)

- Jitter timing validation (200-700ms range)
- Batch chunking logic (5 per chunk)
- Noisy domain filtering
- UI-ready response shape validation
- Grounding metadata presence (`groundedAt`, `sourceUrl`)
- Error handling (API failures return empty array, not crash)

#### [MODIFY] [apiClient.test.ts](file:///home/blake/Src/blakebarrett/BuildSheet-Phoenix/server/src/__tests__/apiClient.test.ts)

- Add `sourcing.find`, `sourcing.hydrate`, `sourcing.local`, `sourcing.batch` to contract registry

## Verification Plan

### Automated Tests
- `cd server && npm test` — all contract + search service tests pass
- `npx vite build` — frontend builds cleanly without search/grounding code
- `cd server && npx tsc --noEmit` — server TypeScript checks pass

### Manual Verification
- Verify that clicking "Source Part" in the UI triggers a server API call (check Network tab)
- Verify that no `@google/genai` search calls appear in browser Network tab
- Verify that the Gemini API key is not present in the client bundle (`grep` the dist output)
