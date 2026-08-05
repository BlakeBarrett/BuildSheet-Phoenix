# BuildSheet — Deep Review & Implementation Plan

Comprehensive review of the BuildSheet-Phoenix codebase (root `App.tsx` ~244 KB / 3,910 lines, `server/` Express + Firebase Admin, `services/` frontend service layer, `website/` static marketing site), consolidating:

1. The code audit findings (security, correctness, architecture),
2. `SUGGESTIONS.md` TODOs (accessibility, UX, maintainability),
3. `../CONSTITUTION.md` compliance gaps (rev. 2026).

Per CONSTITUTION §2, every work item is paired with its associated test. All items are stated relative to the current `local-fable-review` HEAD (`dd8b333`).

---

## 1. Executive Summary

BuildSheet has a strong, correct default posture — API keys live server-side in the default `openai-compat` path, secrets are gitignored, there is a real Playwright E2E suite, and a cleanly separated Express backend. However, three **critical security defects** can be exploited on a production deploy as-is:

1. **Unauthenticated, un-rate-limited AI proxy** (`/api/v1/ai/*`) that forwards the server's paid `AI_KEY` for anyone — a direct cost-exhaustion/DoS vector.
2. **Auth middleware fails open** — Firebase misconfiguration silently downgrades every `requireAuth` route to a shared `guest`/`dev-user` identity, breaking cross-tenant isolation.
3. **Stored/reflected XSS** on the public server-rendered share pages (unescaped `assemblyUrl`, user `slug`, and `Host` header).

Beneath that sit correctness bugs (camera resource leak, out-of-order save race, SSE that can hang forever, expired Stripe promo) and structural debt (a 3,900-line `App.tsx`, dead code, no lint/typecheck gate). The revised CONSTITUTION also mandates several capabilities the repo lacks entirely: OpenAPI spec, MCP gateway, OpenTelemetry, SBOM/signing, SAST, secret scanning, append-only audit logging, a Compliance Register, and WCAG 2.2 + performance-budget gates.

The plan below is phased so value lands early and risk stays contained.

---

## 2. Priority Matrix (merged)

| Sev | Item | Source | Constitution |
|---|---|---|---|
| CRIT | Unauthenticated AI proxy `/api/v1/ai/*` (cost abuse) | audit | §7 rate limiting, §5 MCP parity |
| CRIT | Auth fail-open in production | audit | §7 authn/authz |
| CRIT | Stored/reflected XSS on share pages | audit | §7 input validation / output encoding |
| HIGH | Rate limiting broken behind nginx (no `trust proxy`) | audit | §7 rate limiting |
| HIGH | Camera resource leak (`ARGuideView`) | audit | §4 a11y-safe UI |
| HIGH | Out-of-order save race (`draftingEngine`) | audit | §2 |
| HIGH | SSE hangs / chunks discarded | audit | §2 |
| HIGH | Expired Stripe promo code | audit | — |
| HIGH | `firebaseInitialized` never set; circular import | audit | §2 |
| HIGH | CSP disabled; `helmet({ contentSecurityPolicy: false })` | audit + §7 | §7 security headers |
| MED | `App.tsx` monolith (3,910 lines) | audit + SUGGESTIONS P0 | §1 SOLID |
| MED | `draftingEngine` persistence coupling | SUGGESTIONS | §1 SRP |
| MED | `apiClient` duplicated error paths | audit + SUGGESTIONS P1 | §2 DRY |
| MED | `any` abuse / missing types | audit + SUGGESTIONS P3 | §2 |
| MED | Local-model routing is dead code | audit | §2 |
| MED | Client-side tier backdoor (localStorage) | audit | §7 RBAC |
| MED | i18n "8 languages" overclaim; no switcher | audit | §4 |
| MED | Runs as root, unpinned base image | §7/§1 | §1 containerization |
| LOW | Dead files, empty `src/`, missing page titles | audit + SUGGESTIONS P2 | §3 docs |
| GAP | No lint/typecheck gate; weak CI | audit | §2 |
| GAP | No OpenAPI spec / RFC 9457 errors | audit | §5 |
| GAP | No MCP gateway | audit | §5 |
| GAP | No `/metrics`, no OTel tracing, no Sentry | audit | §10 |
| GAP | No GDPR export/erasure endpoints, no audit log | audit | §6, §10 |
| GAP | No Compliance Register, ADRs, CHANGELOG, LICENSE | audit | §3, §6 |
| GAP | No SBOM/signing, SAST, secret scan, license scan | audit | §7 |
| GAP | No SLOs, backup/DR policy, incident-response plan | audit | §9 |

---

## 3. Phase 0 — Tooling & Engineering Gates

*Prerequisite for all later phases. Cannot enforce the constitution without a gate that fails builds.*

**T0.1 — Linting & formatting.** Add `eslint` + `prettier` (root and `server/`) with `react-hooks/exhaustive-deps` and `@typescript-eslint/no-explicit-any`. Apply to both TypeScript roots. *Test:* lint job in CI fails the build on any violation (CONSTITUTION §2).

**T0.2 — Frontend unit testing.** Add root `vitest` + `jsdom` (server already has Vitest). Enable `services/`, `hooks/`, `components/` coverage. *Test:* `npm test` runs server + frontend suites; new suites added in later phases land here.

**T0.3 — Harden CI** (`.github/workflows/ci.yml`). Replace `npx tsc --noEmit || true` with a real fail gate; add a Vitest job (currently only Playwright runs); remove `continue-on-error: true` on Playwright; add commitlint (Conventional Commits incl. `BREAKING CHANGE:`); add Dependabot. *Test:* CI green gate; a broken typecheck or test fails CI (CONSTITUTION §2, §7 supply-chain).

**T0.4 — Coverage ramp to 80%.** Raise `server/vitest.config.ts` thresholds in staged steps (30 → 50 → 80) across successive PRs, enforced per package. Tests must assert **behavior**, not merely execute lines. *Test:* `vitest --coverage` fails below the active threshold (CONSTITUTION §2).

**T0.5 — Dependency hygiene.** Pin production deps (drop `^`), remove unused `pino-http` from `server/package.json`. *Test:* `npm audit --audit-level=high` + `npm ls` in CI (CONSTITUTION §7).

**T0.6 — Secret scanning.** Add gitleaks as a pre-commit hook and CI step. Rotate the DashScope `AI_KEY` and any keys that have been on disk in `.env` (even though gitignored). *Test:* gitleaks CI job; pre-commit hook (CONSTITUTION §7).

**T0.7 — SAST.** Add CodeQL (or Semgrep) for server + frontend in CI. *Test:* SAST job gates merge (CONSTITUTION §7).

**T0.8 — License scanning.** Add `license-checker`/FOSSA; verify copyleft (GPL/AGPL) and non-commercial (CC-BY-NC) dependencies absent without legal review — including ML model weights/datasets used in generation. *Test:* CI license job (CONSTITUTION §7).

**T0.9 — Supply-chain releases.** Generate a CycloneDX SBOM per release; sign images with cosign; pin base image (`node:22-slim@sha256:…`); run the container as non-root (`USER` directive — currently missing). *Test:* SBOM/signature verified in the release pipeline; container smoke test asserts non-root UID (CONSTITUTION §1, §7).

**T0.10 — Repo governance docs.** Add `LICENSE`, `CHANGELOG.md`, `docs/adr/` (Architecture Decision Records), and a decision log for constitution waivers (time-boxed only). *Test:* CI doc-presence check + ADR template lint (CONSTITUTION §3).

---

## 4. Phase 1 — Critical Security

**S1 — Lock down the AI proxy.** Mount `requireAuth` + `generationRateLimit` on `aiRouter` (`server/src/index.ts:132`); validate `model` against a server-side allowlist and clamp `max_tokens` (`server/src/routes/ai.ts:43,46`); validate `messages` is an array in `/generate-structured` (`:94`). *Tests:* `ai.test.ts` — no token → 401; over-limit → 429; unknown model / oversized max_tokens → 400; valid proxy still returns provider JSON.

**S2 — Auth fails closed.** In `server/src/middleware/auth.ts:79-94`, remove guest/dev-user downgrades when `NODE_ENV=production` (return 503 when Firebase unavailable); canonicalize the `SERVER_NODE_ENV`/`NODE_ENV` mismatch (`.env` sets `SERVER_NODE_ENV`, code reads `NODE_ENV`); keep dev pass-through only when `NODE_ENV !== 'production'` *and* Firebase is intentionally absent. *Tests:* rewrite `auth.test.ts` — production + failure → 401/503 (fail closed); dev → guest; valid token → uid.

**S3 — Share-page XSS.** In `server/src/routes/shares.ts`: HTML-escape `assemblyUrl` and `host` in every interpolation (`:87,110,140-141,381`); restrict `slug` to `[a-z0-9-]` (`:579`); validate `assemblyUrl` scheme (reject `javascript:`, `data:`, control chars). *Tests:* `shares.test.ts` unit cases (CSS breakout, slug injection, Host header) + extend `tests/shareLink.spec.ts` E2E.

**S4 — Rate limiting behind nginx.** Set `app.set('trust proxy', 1)` and key guest buckets by `X-Forwarded-For` (`server/src/middleware/rateLimit.ts`). *Test:* rateLimit unit test asserting per-IP buckets under `X-Forwarded-For`.

**S5 — SSRF guard.** In `server/src/services/procurementEngine.ts:129-145`, validate discovery URLs before Firecrawl: scheme allowlist (`http/https`), block private/loopback/link-local and cloud-metadata (`169.254.169.254`). *Test:* unit test with malicious hosts.

**S6 — Secrets via Secret Manager.** Update `service.yaml` + `deploy.sh` to inject `AI_KEY` / `SEARCH_API_KEY` / `FIRECRAWL_API_KEY` via `secretKeyRef` instead of plaintext env. *Test:* deploy-script dry-run + spec review asserting no plaintext secret in the Cloud Run spec.

**S7 — Input validation, output encoding, and security headers.** Introduce server-side schema validation for all request bodies; adopt RFC 9457 Problem Details error format app-wide; re-enable CSP (currently disabled at `server/src/index.ts:88`) with a policy that allows the SPA's assets, and verify HSTS / `X-Content-Type-Options` / `frame-ancestors`. *Tests:* route integration tests assert `application/problem+json` on 4xx/5xx; header assertions in a smoke spec.

**S8 — OWASP LLM Top 10 for AI-facing components.** Review the AI proxy, architect chat, and procurement pipeline for prompt-injection and insecure-output-handling. At minimum: treat LLM output as untrusted (fix the `handleExportPDF` `document.write` XSS at `App.tsx:2749-2792` by escaping user strings), and add an instruction-based boundary on the proxy. *Test:* unit test asserting a crafted prompt cannot influence system instructions / an HTML-escaped export.

**S9 — Append-only audit log.** Record auth events, data exports, erasure requests, and admin actions to an append-only audit store (separate from app logs) with defined retention. *Tests:* integration test asserts an audit entry is written for each event class and cannot be modified in place.

---

## 5. Phase 2 — High Correctness

**C1 — Firebase flag + circular import.** Set `firebaseInitialized = true` after `getFirestore()` succeeds (`server/src/index.ts:58-64`); move shared state to a small config module to break the `index.ts` ↔ `projects.ts` cycle. *Tests:* `projects.test.ts` + new init test asserting the flag transitions.

**C2 — Camera leak.** `components/ARGuideView.tsx:34` — track the stream in a `useRef` and stop tracks in cleanup. *Test:* component test mocking `navigator.mediaDevices.getUserMedia`; assert `stop()` on unmount.

**C3 — Save serialization.** `services/draftingEngine.ts:285` — add a save queue (chained promises / debounce + in-flight dedupe) so rapid edits cannot land out of order. *Test:* `draftingEngine.spec.ts` race test with delayed PUT resolutions asserting final server state equals newest edit.

**C4 — SSE robustness.** `services/apiClient.ts:183-219` — AbortController timeout; guarantee `onDone`/`onError` settle on connection end; wire chunks through `services/serverAiService.ts:38-42` so the UI renders incremental output. *Tests:* mock-SSE integration test (mid-stream close settles the promise; chunks reach the callback; timeout aborts).

**C5 — Stripe promo.** Remove expired hardcoded `promo_1THXv5DWtg9s0tYcn8ElRlE6` (`services/stripeCheckout.ts:13`, expired 1 Jul 2026) or make it env-configured. *Test:* `stripeIntegration.spec.ts` updated.

**C6 — apiClient DRY.** Extract a shared `handleApiErrors(resp)` used by all HTTP verbs. *Test:* `apiClient` unit tests per status path (503/500/network).

**C7 — Type tightening.** Replace `any` with typed surfaces (`BOMEntry`, `UserMessage`, `AuditAction`) and remove unnecessary casts (`App.tsx:989-1018,2940`; `types.ts:146,219`). *Test:* tsc gate + existing specs.

---

## 6. Phase 3 — Refactoring & Maintainability

**R1 — Split `App.tsx`.** Extract `ProjectNavigator`, `PartDetailModal`, `ScanPartModal`, `AuditModal`, and a shared modal shell into `components/`; split `AppContent` (~2,100 lines, 81 `useState`) into `useDrafting`, `useAuth`, `useProjectSync`, `useSourcing` hooks. *Test:* all existing Playwright specs must pass unchanged (behavior-preserving refactor, one PR per extraction).

**R2 — DraftingEngine persistence layer.** Extract hydration/server-sync into `services/persistence.ts`. *Test:* existing `draftingEngine.spec.ts` + new persistence specs.

**R3 — Dead code.** Delete `services/cloudAiService.ts.backup` (58 KB) and `server/test-dashscope.ts`; wire `HybridAIService` into the active service chain or remove it and its Settings-modal config; correct the "zero-leakage" README claim to match the surviving path. *Test:* `tests/localModelRouting.spec.ts` aligned to the surviving behavior.

**R4 — Deep copy.** `services/draftingEngine.ts:361-363` — return a copy deep enough that callers cannot mutate engine state. *Test:* draftingEngine unit test asserting mutation of a returned session does not affect engine state.

**R5 — Hygiene.** Delete the empty `src/` stub; add `<title>` to `website/about.html` + `website/changelog.html` (SUGGESTIONS P2); add survey empty-state handling; convert the settings dropdown to a semantic `<ul role="list">`; fix the wrong `aria-label` on the project-title input (`App.tsx:3392`); extract a shared `downloadBlob()` helper. *Test:* `marketing_site.spec.ts` title assertions + `settingsModal.spec.ts` + axe scans.

**R6 — Server-side tier enforcement.** Move plan limits (projects, exports) server-side keyed by `uid`/`planTier`; remove the `__test_tier_override__` localStorage backdoor (`services/tierService.ts:87-99`) outside test builds. *Tests:* server-tier unit tests + `settingsModal.spec.ts`.

---

## 7. Phase 4 — Constitution-Mandated Features & Governance

**K1 — API specification & conventions.** Commit a versioned `openapi.yaml` covering all `/api/v1` routes, validated in CI against the implementation; adopt RFC 9457 Problem Details, consistent pagination, and idempotency keys on non-idempotent operations (checkout, project create, migrate). *Test:* Redocly lint gate + contract test asserting routes match the spec.

**K2 — MCP gateway.** Expose project/BOM/sourcing tools via an MCP server with the **same** auth, authorization, and rate-limiting controls as the primary API. *Test:* MCP integration test invoking a tool with and without a token.

**K3 — Observability.** Add `/metrics` (prom-client) and split `/health` into liveness/readiness; emit structured JSON logs with a **server-generated** correlation ID (sanitize the client `x-request-id` to fix the CRLF vector in `server/src/middleware/logger.ts:52`); add OpenTelemetry tracing for cross-service requests; integrate Sentry in staging/prod. *Tests:* health/metrics smoke spec; logger unit test with a hostile header asserting no injection and a server-owned ID; trace-span smoke test.

**K4 — Data governance.** Add `/api/v1/user/data-export` (JSON/CSV) and `/api/v1/user/erase` that cascade to Firestore, IndexedDB images, and the audit log; define retention + data classification (public/internal/confidential/restricted) and a documented backup-erasure interaction policy. *Tests:* integration tests for export shape, erasure cascade, and re-deletion-on-restore logic.

**K5 — Compliance Register & incident readiness.** Create a versioned `docs/compliance-register.md` (jurisdictions, applicable laws, controls, owners; quarterly review); record DPIAs and the EU AI Act risk classification for the generative features; add a breach-notification plan (72h clocks, contact chains); document incident severity levels, on-call, escalation, and a blameless-postmortem template; define SLOs + error budgets. *Test:* doc-structure CI check + quarterly review tracked as an ADR.

**K6 — Progressive delivery.** Gate risky features behind `services/featureFlags.ts`; document canary/blue-green rollout and automated rollback criteria. *Test:* feature-flag unit tests + a rollout runbook.

**K7 — Backups & DR.** Define RPO/RTO and a backup schedule; commit a quarterly restore-test runbook. *Test:* documented restore drill checklist; backup-expiry assertions tied to the erasure policy (K4).

---

## 8. Phase 5 — UX, Accessibility & i18n

**A1 — Skip link.** Add a "Skip to main content" link per WCAG 2.2 (2.4.1). *Test:* axe-core Playwright assertion + keyboard-tab E2E.

**A2 — ARIA & semantic fixes.** Correct ARIA labels, add `role="progressbar"` on loading cards, fix heading hierarchy, ensure every icon button has a label. *Test:* axe-core scans (no auto-detectable violations) on BOM editor, settings, modals; periodic manual keyboard + screen-reader pass.

**A3 — i18n completeness gate + staged translation.** Add a completeness test (every key present and translated in each of the 8 locales); ramp translation coverage per locale (e.g., 30 → 60 → 90%) over PRs; add a language switcher (`lang.select` exists but is unused); align the README claim with real coverage. *Test:* `i18n.spec.ts` gate (CONSTITUTION §4).

**A4 — Performance budgets.** Define Core Web Vitals budgets and enforce as CI/release gates (LCP, CLS, INP) on the SPA + marketing site; remove the CDN import-map duplication of `package.json` deps in `index.html:119-134`. *Test:* Lighthouse CI step with budget thresholds (CONSTITUTION §4).

---

## 9. Test Strategy

- **Server:** Vitest (existing) — unit + route integration; behavior-asserting; coverage gate ramping to 80%.
- **Frontend:** new root Vitest + jsdom for services/hooks/components; component tests for the resource-leak and race fixes.
- **E2E:** Playwright (14 spec files) — the behavior-preservation harness for R1/R2 refactors; axe-core for a11y; extend `shareLink`, `settingsModal`, `localModelRouting`, `stripeIntegration`, `marketing_site` specs.
- **Static/security:** tsc, ESLint/Prettier, CodeQL/Semgrep, gitleaks, license-checker, Redocly, commitlint, Dependabot, `npm audit`, Lighthouse.
- **CI:** every PR must pass typecheck, lint/format, unit + coverage, Playwright, SAST, secret scan, audit, spec-lint, commitlint.

---

## 10. Constitution § → Item Mapping

| Constitution | Items |
|---|---|
| §1 SOLID / 12-factor / containers (non-root, pinned) | R1, R2, T0.9 |
| §2 tests / 80% coverage / commits / review / lint / CI | T0.1, T0.2, T0.3, T0.4, all phases |
| §3 SemVer / CHANGELOG / LICENSE / ADRs | T0.10, K5 |
| §4 i18n / WCAG 2.2 / perf budgets | A1, A2, A3, A4 |
| §5 API-first / OpenAPI / RFC 9457 / MCP | K1, K2, S1, S7 |
| §6 Compliance Register / erasure / portability / responsible AI / robots.txt | K4, K5, S3, S8 |
| §7 OWASP (incl. LLM) / secrets / OAuth+RBAC / SBOM / SAST / headers / rate-limit | S1–S9, T0.5–T0.9, R6 |
| §8 environments / parity / prod data hygiene / progressive delivery | K6 |
| §9 SLOs / backups / incident response | K5, K7 |
| §10 structured logs / OTel / /health+/metrics / Sentry / audit log | K3, S9 |

---

## 11. Risks & Open Questions

- **80% coverage from ~30%** is multi-sprint; the staged ramp (T0.4) keeps it honest without freezing feature work.
- **Behavior-preserving refactors (R1/R2)** are the riskiest changes; each extraction must land in its own PR with the full E2E suite green.
- **i18n translation volume** (8 locales × ~199 keys) is content work; the completeness gate (A3) prevents regressions while coverage ramps.
- **MCP gateway (K2)** and **OpenTelemetry (K3)** scope should be validated against actual integration needs before building.
- **GDPR endpoints (K4)** require a documented retention/classification policy and confirmation of hosting regions for data residency; the Compliance Register (K5) must record the assessment.
- **Helmet CSP re-enablement (S7)** risks breaking the SPA's inline styles/CDN scripts; requires a pairing with T0.1/A4 and a staging test before production.

*Status: living document. Update as items are completed; mark completed items with a checkbox.*
