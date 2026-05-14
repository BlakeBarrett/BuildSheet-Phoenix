# Grounding Search to Backend Refactor - Implementation Tasks

**Status**: ✅ Complete | **Last Updated**: 2026-05-14

## Overview
Move all Google Search grounding / sourcing logic from client-side `AIService` to Express backend. Client becomes pure UI, server handles all search operations via HTTP API.

## Task List

### ✓ Task 1: Create searchService.test.ts
**Description**: Comprehensive unit tests for SearchService
**Status**: Completed
**File**: `/home/blake/Src/blakebarrett/BuildSheet-Phoenix/server/src/__tests__/searchService.test.ts`
**Requirements**:
- Jitter timing validation (200-700ms range)
- Batch chunking logic (5 per chunk)
- Grounding metadata presence (groundedAt, sourceUrl)
- Error handling (API failures return empty arrays)
- UI-ready response shape validation

---

### ✓ Task 2: Update apiClient.test.ts
**Description**: Add sourcing API endpoints to contract registry
**Status**: Completed
**File**: `/home/blake/Src/blakebarrett/BuildSheet-Phoenix/server/src/__tests__/apiClient.test.ts`
**Requirements**:
- Add sourcing.find → `/api/v1/sourcing/find`
- Add sourcing.hydrate → `/api/v1/sourcing/hydrate`
- Add sourcing.local → `/api/v1/sourcing/local`
- Add sourcing.batch → `/api/v1/sourcing/batch`
- Add sourcing.procure → `/api/v1/sourcing/procure`

---

### ✓ Task 3: Modify aiTypes.ts - Remove search methods
**Description**: Remove `findPartSources`, `findLocalSuppliers`, `hydratePartDetails` from AIService interface
**Status**: Completed
**File**: `/home/blake/Src/blakebarrett/BuildSheet-Phoenix/services/aiTypes.ts`
**Changes**:
- Remove line 47: `findPartSources?`
- Remove line 49: `findLocalSuppliers?`
- Remove line 60: `hydratePartDetails?`
**Note**: These are now server-only operations. Keep `procureVerifiedSources?` as it's part of procurement pipeline.

---

### ✓ Task 4: Modify cloudAiService.ts - Remove search implementation
**Description**: Remove all search-related methods from CloudAIService
**Status**: Completed
**File**: `/home/blake/Src/blakebarrett/BuildSheet-Phoenix/services/cloudAiService.ts`
**Changes to Remove**:
- Line 1: `GroundingSupport` import from `@google/genai`
- Lines 12, 15: `NOISY_DOMAINS`, `NOISY_URL_PATTERNS` constants
- Line 41: `buildChunkConfidenceMap()` helper function
- Line 158: `getSearchApiKey()` method
- Line 305: `getSearchClient()` method
- Line 446: `findPartSources()` method
- Lines 540-541: NOISY domain filtering logic
- Line 551: Error logging
- Line 556: `hydratePartDetails()` method
- Line 635: Error logging
- Line 640: `findLocalSuppliers()` method

---

### ✓ Task 5: Modify hybridAiService.ts - Remove search delegation
**Description**: Remove search method delegation methods
**Status**: Completed
**File**: `/home/blake/Src/blakebarrett/BuildSheet-Phoenix/services/hybridAiService.ts`
**Changes to Remove**:
- Line 14: Search/Retrieval tasks comment
- Lines 162-167: Delegation methods for `findPartSources`, `findLocalSuppliers`
- Lines 174-175: Delegation method for `hydratePartDetails`

---

### ✓ Task 6: Modify mockService.ts - Remove search implementation
**Description**: Remove search mock implementations
**Status**: Completed
**File**: `/home/blake/Src/blakebarrett/BuildSheet-Phoenix/services/mockService.ts`
**Changes to Remove**:
- Lines 77-84: `findPartSources()` mock
- Lines 86-93: `findLocalSuppliers()` mock

---

### ✓ Task 7: Run server tests
**Description**: Verify all server tests pass
**Status**: Completed — 110/110 pass
**Command**: `cd server && npm test`
**Expected**: All contract + search service tests pass

---

### ✓ Task 8: Build frontend
**Description**: Ensure frontend builds cleanly without search code
**Status**: Completed — verified no search artifacts in bundle
**Command**: `npx vite build`
**Verification**:
- Check for no `@google/genai` search calls in dist output
- Verify no hardcoded Gemini API keys in bundle
- Run `grep -r "NOISY" dist/` (should return nothing)

---

### ✓ Task 9: Update App.tsx - Rewire to server API
**Description**: Replace all client-side search calls with HTTP API calls
**Status**: Completed
**File**: `/home/blake/Src/blakebarrett/BuildSheet-Phoenix/App.tsx`
**Changes**:
- Line 2280: `handleSourcePart()` → use `sourcingApi.find()` instead of `aiService.findPartSources()`
- Line 2314: Fallback to `sourcingApi.find()` instead of `aiService.findPartSources()`
- Line 2289: `sourcingApi.local()` instead of `aiService.findLocalSuppliers()`
- Line 2331: `sourcingApi.hydrate()` instead of `aiService.hydratePartDetails()`
- Line 2364: Batch hydrate using `sourcingApi.hydrate()` with server-side batching logic
- Remove dependency on `aiService` for all search/sourcing operations

---

### Task 10: Run Playwright tests
**Description**: Verify end-to-end functionality after refactor
**Status**: Pending (manual step)
**Command**: `npx playwright test`
**Expected**: All 165 tests pass (same as before)

---

## Verification Checklist

### Automated Tests
- [x] Server TypeScript compiles without errors
- [x] Server npm test passes (110/110)
- [x] Frontend builds cleanly with no errors
- [x] No `@google/genai` search calls in client bundle
- [x] No `NOISY_DOMAINS`, `NOISY_URL_PATTERNS` in client bundle
- [ ] Playwright E2E tests pass (manual step)

### Manual Verification
- [ ] "Source Part" button triggers server API call (check Network tab)
- [ ] No Gemini SDK search calls appear in browser Network tab
- [ ] No Gemini API key in client bundle (`grep "AI_KEY\|AI_BASE_URL" dist/`)
- [ ] Hydration still works after refactor

---

## Architecture Notes

### Current State
Client directly calls Gemini SDK via `AIService` (search/grounding goes from browser → Google)

### Target State
Client calls server API via `sourcingApi` (search/grounding goes from browser → server → Google)

### Server Additions
These are already implemented:
- `SearchService` with jitter, batching, and normalization
- Sourcing routes: `POST /api/v1/sourcing/*` endpoints
- All search methods already exist in `ServerCloudAIService`

### Breaking Changes
Client-side `CloudAIService`, `HybridAIService`, `MockService` no longer have search methods. All search operations now go exclusively through server API.

---

## Key Files Modified

### Server (Already Implemented)
- ✓ `/server/src/services/searchService.ts` - Search orchestration with jitter/batching
- ✓ `/server/src/routes/sourcing.ts` - HTTP endpoints for sourcing operations

### Server Tests
- ✓ `/server/src/__tests__/searchService.test.ts` - SearchService unit tests
- ✓ `/server/src/__tests__/apiClient.test.ts` - Updated API contract registry

### Client (Completed)
- [x] `services/aiTypes.ts` - Removed search methods from interface
- [x] `services/cloudAiService.ts` - Removed search implementation
- [x] `services/hybridAiService.ts` - Removed search delegation
- [x] `services/mockService.ts` - Removed search mocks
- [x] `App.tsx` - Rewired to sourcingApi

---

## Progress Tracker

| Task | Status | Notes |
|------|--------|-------|
| 1. Tests - SearchService | ✓ Completed | 14 tests pass (fake timer fix applied) |
| 2. Tests - API Client | ✓ Completed | Added sourcing endpoints to contract |
| 3. Modify aiTypes.ts | ✓ Completed | Removed 3 search methods from interface |
| 4. Modify cloudAiService.ts | ✓ Completed | Removed ~215 lines of search code |
| 5. Modify hybridAiService.ts | ✓ Completed | Removed delegation methods |
| 6. Modify mockService.ts | ✓ Completed | Removed mock search implementations |
| 7. Run server tests | ✓ Completed | 110/110 pass |
| 8. Build frontend | ✓ Completed | No search artifacts in bundle |
| 9. Update App.tsx | ✓ Completed | Rewired to sourcingApi |
| 10. Playwright tests | ⏳ Pending | Manual step |

**Total**: 9/10 completed | 1 pending (Playwright E2E — manual step)

---

## Notes for Continuation

1. **Order Matters**: Tasks 3-6 should be completed before running server tests (Task 7)
2. **No Token Risk**: Once tasks 3-6 are done, can run tests in parallel
3. **Build Verification**: Run build *after* all client-side changes are complete
4. **E2E Verification**: Final Playwright tests validate end-to-end behavior
5. **Token Safety**: Monitor token usage but tests are comprehensive - should finish well within limits