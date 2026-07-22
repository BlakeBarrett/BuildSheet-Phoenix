# AI Provider Agnosticism Plan

## Executive Summary

Two experimental branches (`de-google` and `de-gemini-branding`) attempted to decouple BuildSheet from Google/Gemini vendor lock-in. The `de-gemini-branding` branch (5 commits) completed a clean rebrand to cloud-agnostic terminology. The `de-google` branch (20+ commits) attempted a larger refactor but removed the entire server backend and is not mergeable.

**Goal**: Create a new branch `provider-agnosticism` from `dev` that implements the successful patterns from `de-gemini-branding` while preserving the current `dev` branch functionality.

---

## Branch Analysis

### `de-gemini-branding` (✅ Successful Pattern)
**Commits**: 5 commits ahead of dev  
**Scope**: Branding/user-facing terminology only  
**Changes**:
- Renamed `geminiService.ts` → `architectService.ts` (deprecated alias kept)
- Replaced all "Gemini" references with "cloud" or "Architect" in:
  - PrivacyDisclosure, SettingsModal, VoiceSession components
  - i18n localization strings
  - README, ABOUT.md, website pages
  - deploy.sh, example.env
- Kept backward compatibility: `GEMINI_API_KEY` still works as legacy alias
- Tests renamed: `geminiService.spec.ts` → `architectService.spec.ts`

**Status**: ✅ Safe to merge, minimal risk

---

### `de-google` (❌ Not Mergeable)
**Commits**: 20+ commits ahead of dev  
**Scope**: Complete server backend removal + AI refactoring  
**Changes**:
- Removed entire `server/` directory (Node.js API backend)
- Removed `docker-compose.yml`, nginx config
- Removed CI/CD workflows
- Added `cloudAiService.ts` (800+ lines) with dual-path support
- Added `aiConfig.ts` for provider abstraction
- Added preferred vendor management
- Added folder management features
- Added i18n infrastructure
- Removed 17,525 lines, added 3,324 lines

**Problems**:
- ❌ Removes the server backend that `dev` currently uses
- ❌ Breaks Docker deployment architecture
- ❌ Removes Firebase auth, Stripe, shares API
- ❌ Tests expect server endpoints that no longer exist
- ❌ Conflicts with current `dev` architecture

**Status**: ❌ Cannot merge; would need to cherry-pick individual features

---

## Recommended Approach

### Phase 1: Branding Cleanup (from `de-gemini-branding`)
**Priority**: High  
**Risk**: Low

Implement the clean rebrand from `de-gemini-branding`:

1. **Rename service files**:
   - `services/geminiService.ts` → `services/architectService.ts`
   - Keep `geminiService.ts` as deprecated re-export for backward compat
   - Rename tests: `tests/geminiService.spec.ts` → `tests/architectService.spec.ts`

2. **Update user-facing strings**:
   - PrivacyDisclosure: "sent to Google Gemini" → "sent to the cloud"
   - SettingsModal: "defaultGemini" → "defaultCloud"
   - VoiceSession: "Gemini Cloud API" → "Cloud API"
   - i18n: All "Gemini" mentions → "cloud" or "AI"

3. **Update documentation**:
   - README.md, ABOUT.md: "Gemini 3" → "multimodal vision AI"
   - Website pages (privacy, index, changelog): vendor-agnostic language
   - docs/ON_PREM_READINESS.md: update references

4. **Environment variables**:
   - Keep `GEMINI_API_KEY` as legacy alias
   - Add `CLOUD_API_KEY` as primary (optional, for new deployments)
   - Update deploy.sh, example.env with new naming

---

### Phase 2: Provider Abstraction (selective cherry-picks from `de-google`)
**Priority**: Medium  
**Risk**: Medium

Cherry-pick specific features that don't break architecture:

1. **AI Config abstraction** (`services/aiConfig.ts`):
   - Provider type definition (`'gemini' | 'openai-compatible'`)
   - Model name constants with env overrides
   - `getAiProvider()`, `getAiBaseUrl()`, `getCloudAiDisplayName()`

2. **Dual-path CloudAIService**:
   - Keep current server-proxied architecture
   - Add `AI_PROVIDER` env var to route between:
     - `'gemini'` → Google SDK (current)
     - `'openai-compatible'` → OpenAI-compatible API (for on-prem)
   - Update `cloudAiService.ts` to check provider and route accordingly

3. **Procurement engine updates**:
   - Decouple from hardcoded "gemini" references
   - Add generic AI client interface
   - Update `procurementEngine.ts` to use provider-agnostic calls

---

### Phase 3: Testing & Validation
**Priority**: High  
**Risk**: Low

1. Update test names and imports
2. Run all 160 Playwright tests
3. Verify Docker build still works
4. Test both provider paths (gemini + openai-compatible)
5. Verify backward compatibility (old env vars still work)

---

## Implementation Plan

### Step 1: Create Branch
```bash
git checkout dev
git pull origin dev
git checkout -b provider-agnosticism
```

### Step 2: Apply Branding Changes
Files to modify:
- `services/geminiService.ts` → rename to `architectService.ts` + deprecated alias
- `services/cloudAiService.ts` → update imports
- `components/PrivacyDisclosure.tsx`
- `components/SettingsModal.tsx`
- `components/VoiceSession.tsx`
- `services/i18n.ts` (bulk find/replace)
- `README.md`, `ABOUT.md`
- `website/index.html`, `website/privacy.html`, `website/changelog.html`
- `deploy.sh`, `example.env`
- `tests/geminiService.spec.ts` → rename to `architectService.spec.ts`

### Step 3: Add Provider Abstraction
- Create `services/aiConfig.ts` (from `de-google`)
- Update `services/cloudAiService.ts` to use provider routing
- Update `services/aiManager.ts` to read provider config
- Update `services/procurementEngine.ts` to use generic AI client

### Step 4: Update Configuration
- `vite.config.ts`: Add provider env vars to define
- `example.env`: Add `AI_PROVIDER`, `AI_BASE_URL`, model overrides
- `deploy.sh`: Support both `GEMINI_API_KEY` and `CLOUD_API_KEY`

### Step 5: Test
```bash
npm run build
npx playwright test
```

---

## Risk Mitigation

1. **Backward Compatibility**: Keep `GEMINI_API_KEY` as fallback
2. **Gradual Rollout**: Deploy with `AI_PROVIDER=gemini` (default)
3. **Feature Flag**: Add `provider-agnosticism` feature flag for testing
4. **Documentation**: Update ON_PREM_READINESS.md with new provider options

---

## Success Criteria

- ✅ All 160 tests pass
- ✅ Build succeeds
- ✅ No "Gemini" references in user-facing UI (except legacy env vars)
- ✅ Can switch provider via `AI_PROVIDER` env var
- ✅ Docker deployment works
- ✅ Backward compatible with existing deployments

---

## Next Steps

1. Create branch `provider-agnosticism` from `dev`
2. Implement Phase 1 (branding) - estimated 2-3 hours
3. Run tests, commit
4. Implement Phase 2 (provider abstraction) - estimated 4-6 hours
5. Run tests, commit
6. Deploy to staging, validate
7. Merge to `dev`

---

## Files Requiring Changes

| File | Change Type | Priority |
|------|-------------|----------|
| `services/geminiService.ts` | Rename + deprecate | High |
| `services/cloudAiService.ts` | Add provider routing | High |
| `services/aiConfig.ts` | New file | High |
| `services/aiManager.ts` | Update config reading | High |
| `services/procurementEngine.ts` | Decouple from gemini | Medium |
| `components/PrivacyDisclosure.tsx` | Update strings | High |
| `components/SettingsModal.tsx` | Update strings | High |
| `components/VoiceSession.tsx` | Update strings | Medium |
| `services/i18n.ts` | Bulk replace | High |
| `README.md`, `ABOUT.md` | Documentation | High |
| `website/*.html` | Documentation | Medium |
| `deploy.sh`, `example.env` | Config updates | High |
| `vite.config.ts` | Env var define | Medium |
| `tests/geminiService.spec.ts` | Rename | High |

---

## Notes

- The `de-google` branch removed the server entirely - **do not do this**
- The current `dev` architecture uses server-side AI routing (good for security)
- The goal is provider **agnosticism**, not provider **removal**
- Keep the Node.js backend; it handles auth, Stripe, shares, Firestore
- The AI provider abstraction should be at the **service layer**, not the **architecture layer**