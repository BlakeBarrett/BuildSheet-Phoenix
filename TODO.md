# BuildSheet-Phoenix: Bug Inventory & Fix Plan

## Root Cause: Missing Firebase Credentials Breaks Server

When no valid credentials file is mounted (ADC file invalid, skipped by startup_local.sh), the server's `initializeApp({ projectId })` **succeeds** because it only sets a project ID. But when any route calls `getFirestore()`, the Admin SDK throws "Could not load the default credentials" — because there are no credentials to authenticate with Firestore.

The banner "Sync Error: Could not load the default credentials. Browse to https://cloud.google.com/docs/authentication/getting-started for more information." appears because:
- Server returns HTTP 500 with raw error message
- Client's apiClient.ts only has special handling for 503+syncUnavailable, not 500
- App.tsx catches the raw error and displays it in a red banner

---

## RESOLVED BUGS

### BUG-1: Server `index.ts` — `firebaseInitialized` is true when it should be false

**File:** `server/src/index.ts` (lines 54-62)
**Severity:** HIGH → **RESOLVED** ✅
**Status:** Patched and verified. `getFirestore()` test call added after `initializeApp()`. Server now correctly sets `firebaseInitialized = false` when credentials are missing.

**Fix applied:** After `initializeApp()` succeeds, test-call `getFirestore()` inside the try block. If it throws, set `firebaseInitialized = false` and record the error message.

```typescript
try { getFirestore(); } catch (err: any) {
  firebaseInitialized = false;
  firebaseErrorMessage = err.message || 'Failed to connect to Firestore (missing credentials).';
}
```

---

### BUG-2: Server `projects.ts` — 500 responses instead of 503

**File:** `server/src/routes/projects.ts` (lines 29-60, all 7 routes)
**Severity:** HIGH → **RESOLVED** ✅
**Status:** Patched and verified. `checkFirebaseAvailable` now explicitly tests `getFirestore()`, all 7 catch blocks route credential errors through `handleFirebaseError()` returning 503.

**Fix applied:** 
- `checkFirebaseAvailable()`: Explicitly tests `getFirestore()` in try/catch
- `handleFirebaseError(res, err)`: Detects credential errors, returns `{ error, syncUnavailable: true }` with HTTP 503
- All 7 route catch blocks call `handleFirebaseError(res, err)`

**Verified:** `curl http://localhost:8080/api/v1/projects` returns HTTP 503 with `{ "error": "Cloud sync unavailable — server is restarting. Your local data is safe.", "syncUnavailable": true }`

---

### BUG-3: Server `auth.ts` — `getAuth()` fails without credentials

**File:** `server/src/middleware/auth.ts` (lines 88-94)
**Severity:** MEDIUM → **RESOLVED** ✅
**Status:** Patched and verified. Credential errors in token verification now allow through as guest.

**Fix applied:** Added credential error catch block after `app/no-app` check:
```typescript
if (err.message?.includes('credentials') || err.message?.includes('Could not load the default')) {
  console.warn('[Auth] Firebase credentials unavailable — allowing as guest:', err.message);
  req.user = { uid: 'guest', isGuest: true };
  next();
  return;
}
```

**Verified:** Guest mode fully operational. Authenticated requests with valid tokens still verified; invalid tokens return 401.

---

### BUG-4: Client `apiClient.ts` — 500 errors not treated as sync-unavailable

**File:** `services/apiClient.ts` (all 5 HTTP methods: post, get, put, del, patch)
**Severity:** MEDIUM → **RESOLVED** ✅
**Status:** Patched and verified. All HTTP methods now handle 500 responses with "credentials" or "Firestore" in the message.

**Fix applied:** After existing 503 check, added:
```typescript
// 500 with 'credentials' in message
if (resp.status === 500 && (err.error || '').includes('credentials')) {
  return Promise.reject(new Error(msg));
}
// 500 with 'Firestore' in message
if (resp.status === 500 && (err.error || '').includes('Firestore')) {
  return Promise.reject(new Error(msg));
}
```

---

### BUG-5: Client `App.tsx` — Banner shows for unauthenticated users too

**File:** `App.tsx` (line 2024)
**Severity:** LOW → **RESOLVED** ✅
**Status:** Patched and verified. Guests no longer see sync error banner.

**Fix applied:** Added silent skip for "not authenticated" messages:
```typescript
if (msg.toLowerCase().includes('not authenticated')) {
  // Silent skip — no banner for guests
}
```

**Verified:** Browser loads without red banner for guests. Console shows only expected "Server save skipped" warning.

---

### BUG-6: Client `firebase.ts` — Client-side Firebase SDK may fail with incomplete config

**File:** `services/firebase.ts` (lines 41-51)
**Severity:** LOW → **RESOLVED** ✅
**Status:** Patched and verified. `ensureInitialized()` wrapped in try/catch, logs warning instead of throwing.

**Fix applied:**
```typescript
try {
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);
  // ...
} catch (e: any) {
  console.warn('[firebase] Client SDK initialization failed (incomplete config — sync will be unavailable):', e.message);
}
```

---

## REMAINING ITEMS

_All bugs from this inventory are resolved. BUG-7 and BUG-8 were already fixed
in the working tree; their entries below are kept for the record._

### BUG-7: Server startup_local.sh — `CRED_PATH_VALID=false` assignment missing `=` sign

**File:** `startup_local.sh`
**Severity:** LOW (cosmetic/robustness)
**Status:** ✅ Already fixed (verified — line 100 has correct `CRED_PATH_VALID=false`). No change needed.

### BUG-8: Console noise — `saveSessionToServer` logs `console.warn` for guest users

**File:** `services/draftingEngine.ts` (line 189)
**Severity:** LOW (noise)
**Status:** ✅ RESOLVED. Downgraded `console.warn` to `console.debug`. No longer spams the console for guest users.

### BUG-9: Build Feasibility Check — Stale "No audit results available" state

**File:** `App.tsx` (~line 2467)
**Severity:** MEDIUM → **RESOLVED** ✅
**Status:** Patched and verified. Catch block now calls `cacheAuditResult("Verification failed: <error>")` instead of silently ignoring errors.

**Fix applied:** Updated verify endpoint catch block to cache error messages so the audit modal shows actionable feedback instead of "No audit results available."

---

## Summary: Fixed Bugs

| Bug | File | Severity | Status |
|-----|------|----------|--------|
| BUG-1 | `server/src/index.ts` | HIGH | ✅ RESOLVED |
| BUG-2 | `server/src/routes/projects.ts` | HIGH | ✅ RESOLVED |
| BUG-3 | `server/src/middleware/auth.ts` | MEDIUM | ✅ RESOLVED |
| BUG-4 | `services/apiClient.ts` | MEDIUM | ✅ RESOLVED |
| BUG-5 | `App.tsx` | LOW | ✅ RESOLVED |
| BUG-6 | `services/firebase.ts` | LOW | ✅ RESOLVED |
| BUG-7 | `startup_local.sh` | LOW | ✅ RESOLVED |
| BUG-8 | `services/draftingEngine.ts` | LOW | ✅ RESOLVED |
| BUG-9 | `App.tsx` (verify catch) | MEDIUM | ✅ RESOLVED |

---

## Verification Summary (2026-05-24)

All P0-P2 Firebase credential error handling patches deployed and verified:

- **Guest mode:** App loads clean, no red banner, no JS errors
- **API responses:** Server returns HTTP 503 with `{syncUnavailable: true}` for credential errors (not 500)
- **Auth flow:** Guests allowed through; invalid tokens return 401; credential errors treated as dev mode
- **UI:** User sees "Cloud sync unavailable — server is restarting. Your local data is safe." when appropriate
- **Local data:** Fully functional — projects save/load from localStorage/IndexedDB
- **Build Feasibility Check:** Error caching works — failed/timeout verifications show "Verification failed: ..." in audit modal

Container: `buildsheet-local-run` (ports 8080/8081)
Health check: ✅ `curl http://localhost:8080/api/v1/health` → `{"status":"ok","offline":false}`
Projects endpoint: ✅ Returns 503 with user-friendly message
