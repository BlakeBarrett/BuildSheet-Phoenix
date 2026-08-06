# Engineering Constitution

This document defines the non-negotiable principles for this project. All AI-generated and human-written code, specifications, plans, and tasks MUST adhere to these rules. The key words MUST, MUST NOT, SHOULD, and MAY are to be interpreted as described in RFC 2119.

**Scope & applicability.** Rules apply to every service and repository in the project. Rules qualified with "where the project..." are conditional — they bind only when the project has the described characteristic (a user interface, personal-data processing, an AI component, etc.). A project MUST NOT silently skip a conditional rule; if the condition applies, the rule applies.

**Waivers.** Any exception to a MUST-level rule requires a written, time-boxed waiver approved by the project maintainers and recorded in the decision log (see §10). A waiver without an expiry date is invalid.

## 1. Core Architecture & Design
- **SOLID Principles:** All code MUST follow SOLID design principles (Single Responsibility, Open/Closed, Liskov Substitution, Interface Segregation, Dependency Inversion).
- **Twelve-Factor Discipline:** Services MUST externalize configuration, treat backing services as attached resources, and keep processes stateless wherever feasible.
- **Containerization:** All server-side codebases MUST run inside Docker/OCI containers. A `Dockerfile` and a `docker-compose.yml` (or equivalent) for local development is required. Images MUST be built from pinned, minimal base images and run as a non-root user.
- **Infrastructure as Code:** All cloud infrastructure MUST be defined declaratively (e.g., Terraform, CDK, Pulumi) and version-controlled. Manual console changes to staging or production are prohibited outside documented break-glass procedures.
- **Database Migrations:** All schema changes MUST be applied through versioned, forward-only migration tooling committed to the repository. Destructive migrations require an explicit rollback plan.

## 2. Code Quality & Testing
- **Mandatory Testing:** All new code MUST have associated tests — unit tests for business logic, integration tests for API endpoints and UI components, and contract tests where services depend on each other's APIs.
- **Minimum Coverage:** Line coverage MUST NOT fall below 80% for any service or package, enforced as a CI gate. Coverage is a floor, not a target; tests MUST assert behavior, not merely execute lines.
- **Conventional Commits:** All git commits MUST follow the Conventional Commits format (`feat:`, `fix:`, `docs:`, `style:`, `refactor:`, `perf:`, `test:`, `build:`, `ci:`, `chore:`), with breaking changes flagged (`!` or `BREAKING CHANGE:`).
- **Code Review & Branch Protection:** No code may be merged to the default branch without at least one approving review from another contributor. Self-merges are prohibited. The default branch MUST be protected, requiring passing status checks; force-pushes to it are prohibited. (Solo projects MAY waive the reviewer requirement via the standard waiver process, substituting a mandatory self-review checklist.)
- **Linting & Formatting:** All code MUST pass enforced linting and formatting checks before merge, using the ecosystem-standard toolchain for each language (e.g., ESLint + Prettier for TypeScript/JavaScript; Ruff for Python; `gofmt` + `golangci-lint` for Go; Clippy + `rustfmt` for Rust).
- **CI/CD:** A CI/CD pipeline is required for every service. No manual deployments to staging or production are permitted, except through a documented, audited break-glass procedure that requires a follow-up post-incident review.

## 3. Versioning, Documentation & Change Management
- **Semantic Versioning:** All published packages, services, and APIs MUST use Semantic Versioning (MAJOR.MINOR.PATCH).
- **Deprecation Policy:** Breaking API changes require a new major version. Deprecated endpoints MUST emit deprecation signals (e.g., `Deprecation`/`Sunset` headers) and remain available for a published sunset window.
- **Repository Documentation:** Every repository MUST contain a README covering purpose, local setup, test execution, and deployment; a CHANGELOG (generated from Conventional Commits is acceptable); and a LICENSE file.
- **Architecture Decision Records:** Significant architectural decisions MUST be captured as ADRs committed to the repository. Constitution waivers are recorded here as well.

## 4. User Experience (UX) & Accessibility (a11y)
*Applies where the project has a user interface.*
- **Global Compliance:** All user-facing values (text, dates, numbers, currency) MUST be internationalized (i18n) and localized (l10n). No user-visible strings may be hardcoded.
- **Accessibility First:** All UI components MUST conform to WCAG 2.2 Level AA, plus any additional standards required by applicable jurisdictions — including EN 301 549 and the European Accessibility Act (EAA) for the EU, and ADA/Section 508 for U.S. federal contexts. Accessibility checks (automated, e.g., axe, plus periodic manual audits including keyboard-only and screen-reader passes) MUST run in CI.
- **Performance Budgets:** User-facing pages MUST define and enforce performance budgets (e.g., Core Web Vitals thresholds) as CI or release gates.

## 5. API & Interoperability
- **API-First:** All features available in the UI MUST be exposed via a secure, well-scoped API. UI capabilities and API capabilities MUST NOT diverge.
- **API Specification:** Every API MUST have a versioned, machine-readable spec committed to the repository alongside the service code and validated in CI against the implementation (OpenAPI for REST; SDL for GraphQL; `.proto` files for gRPC).
- **Consistent API Conventions:** APIs MUST use a standard error format (RFC 9457 Problem Details for REST), consistent pagination, and idempotency keys for non-idempotent operations that may be retried (payments, resource creation).
- **AI Agent Interoperability:** Where the project exposes functionality to AI agents, it MUST do so through an MCP (Model Context Protocol) server or equivalent open standard, with the same authentication, authorization, and rate-limiting controls as the primary API.
- **Open Standards:** Where features overlap with existing open specifications (e.g., ActivityStreams/ActivityPub for social features, WebAuthn for passwordless auth, iCalendar for scheduling, OAuth 2.0 for delegation), the standard MUST be implemented rather than a proprietary equivalent.

## 6. Legal, Ethics & Compliance
*Applies where the project processes personal data or serves end users. Internal tools processing no personal data MAY record a waiver for this section's data-protection clauses.*
- **Compliance Register (Living Document):** Privacy law is a moving target — the U.S. alone has gone from 20 to 24 comprehensive state privacy laws during 2026. This constitution therefore does NOT enumerate every statute. Instead, the project MUST maintain a versioned Compliance Register listing every jurisdiction where users are served, the applicable laws, the controls that satisfy them, and an owner. The register MUST be reviewed at least quarterly.
- **Anchor Regimes:** At minimum, the system MUST be designed to satisfy the strictest common denominator of the regimes applicable to its user base. Common anchors include: EU/UK GDPR and the ePrivacy Directive; U.S. state comprehensive privacy laws (CCPA/CPRA as the anchor, with CO CPA, VA VCDPA, CT CTDPA, TX TDPSA, UT UCPA, OR OCPA, and successors tracked in the register) plus federal sectoral laws (COPPA, GLBA, HIPAA, PCI-DSS where applicable); Brazil LGPD; Canada PIPEDA and Quebec Law 25; Australia Privacy Act 1988/APPs; Japan APPI; India DPDP Act 2023; China PIPL, DSL, and CSL; Singapore PDPA; South Korea PIPA; and South Africa POPIA.
- **Data Localization:** Where jurisdictions mandate in-country storage or processing (e.g., Russia's Law 242-FZ; China's PIPL/CSL requirements for CIIOs and large-scale processors; sector-specific rules such as RBI payment-data localization in India), the system MUST support regional data residency. Note: India's DPDP Act itself uses a transfer-restriction model rather than blanket localization — the register MUST track sectoral rules separately.
- **Cross-Border Transfers:** All cross-border data transfers MUST use approved mechanisms (adequacy decisions, Standard Contractual Clauses, Binding Corporate Rules, or equivalent) as required by applicable law.
- **Right to Erasure:** The system MUST have a clear, functional, tested pathway to honor erasure requests (GDPR Art. 17, LGPD Art. 18, PIPL Art. 47, POPIA §24, and equivalents), fulfilled within the legally mandated timeframe for each applicable jurisdiction. Erasure MUST propagate to backups per the documented backup-erasure policy (see §9).
- **Data Portability & Activity Logging:** User activity logs MUST be recorded. Users MUST be able to export their data in a machine-readable, portable format (JSON, CSV, or XML) per GDPR Art. 20 and equivalents.
- **Data Retention & Classification:** All user data MUST be classified (e.g., public / internal / confidential / restricted) with explicit retention periods per category and jurisdiction. Data MUST be purged automatically upon expiry or deletion request.
- **Privacy by Design:** New features that process personal data MUST undergo a Data Protection Impact Assessment (DPIA) where required, and default settings MUST be the most privacy-protective reasonable option. Consent, where relied upon, MUST be granular, logged, and revocable.
- **Breach Notification:** An incident-response plan MUST cover breach-notification obligations and clocks (e.g., 72 hours to supervisory authorities under GDPR Art. 33; per-state timelines in the U.S.), with contact chains documented in the Compliance Register.
- **Children's Data:** Where minors may use the system: for U.S. users, the system MUST implement age screening and verifiable parental consent before collecting data from users under 13 (COPPA, as amended). For other jurisdictions, the register MUST track the applicable digital age of consent (13–16 under GDPR Art. 8, varying by member state) and emerging age-appropriate-design requirements.
- **Responsible AI:** Where the project includes AI systems acting on its behalf (agents, classifiers, recommenders, generative features), they MUST follow responsible-AI practices — transparency, explainability, bias mitigation, and human oversight for consequential decisions. AI features serving EU users MUST be assessed against the EU AI Act, including its transparency obligations for AI-generated content and the high-risk obligations now in force; the assessment and risk classification MUST be recorded in the Compliance Register.
- **Crawling & Ingestion Ethics:** Any component that fetches third-party content MUST obey the `robots.txt` of any domain it queries, honor `Disallow` rules and crawl-delay directives, identify itself with an honest User-Agent, and respect published AI-crawling opt-outs. No data may be ingested in violation of a site's terms where those terms are legally enforceable against the project.

## 7. Security
- **OWASP:** All code MUST be written with awareness of and protection against the OWASP Top 10 — and, for AI-facing components (agent gateways, LLM features, ingestion pipelines), the OWASP LLM Top 10, including prompt-injection and insecure-output-handling risks.
- **Transport Security:** All services MUST communicate exclusively over HTTPS/TLS 1.2+ (TLS 1.3 preferred). No plaintext transport of any user data is permitted, including service-to-service traffic.
- **Encryption at Rest & Key Management:** All persistent stores containing user data MUST be encrypted at rest (AES-256 or equivalent). Keys MUST be managed in a dedicated KMS with rotation policies; application code MUST never handle raw master keys.
- **No Hardcoded Secrets:** Credentials, API keys, and secrets are strictly prohibited in source code or committed files. All secrets MUST be injected via environment variables or a dedicated secrets manager, MUST be rotatable without redeploy where feasible, and secret scanning MUST run in CI and as a pre-commit hook.
- **Authentication & Authorization:** All user-facing and service-to-service authentication MUST use OAuth 2.0 / OIDC (or mTLS for service-to-service where more appropriate). Role-based access control (RBAC) is required for all protected resources, applying least privilege by default. MFA MUST be required for all administrative access.
- **Supply-Chain Security:** All projects MUST run automated dependency vulnerability scanning (e.g., Dependabot, Snyk, `npm audit`) in CI; generate an SBOM (CycloneDX or SPDX) for every release artifact; and sign release artifacts and container images (e.g., Sigstore/cosign). Production dependency versions MUST be pinned via lockfiles — wildcards (`*`) and `latest` are prohibited in production manifests, including container base-image tags.
- **Input Validation & Output Encoding:** All external input MUST be validated server-side against explicit schemas; all output MUST be contextually encoded. Security headers (CSP, HSTS, X-Content-Type-Options, frame-ancestors) MUST be set on all user-facing responses.
- **Rate Limiting & CORS:** All public-facing APIs MUST implement rate limiting, request-size limits, and a strict, explicitly configured CORS policy. Wildcard CORS origins are prohibited on authenticated endpoints.
- **Security Testing:** Static analysis (SAST) MUST run in CI. Penetration testing MUST be performed before major releases and at least annually. Findings above an agreed severity threshold block release.
- **License Compliance:** All third-party dependency licenses MUST be compatible with the project's license, verified by automated license scanning in CI. Copyleft (GPL/AGPL) dependencies are prohibited in proprietary services without explicit legal review. This applies equally to ML models, model weights, and datasets — non-commercial licenses (e.g., CC-BY-NC) are prohibited in production without legal sign-off.

## 8. Environment Management
- **Environment Separation:** Three environments are required: `dev`, `staging`, and `production`. Code MUST be promoted through each stage before reaching production.
- **Environment Parity:** `staging` MUST mirror `production` configuration as closely as possible. Configuration differences between the two MUST be documented and justified.
- **Production Data Hygiene:** Production personal data MUST NOT be copied into `dev` or `staging`. Where realistic data is needed, it MUST be synthesized or irreversibly anonymized.
- **Progressive Delivery:** Feature flags SHOULD gate risky changes, and production releases SHOULD use progressive rollout (canary or blue/green) with automated rollback criteria.

## 9. Reliability, Data Protection & Incident Response
- **SLOs:** Every user-facing service MUST define Service Level Objectives (availability, latency) with error budgets. Sustained budget burn triggers a freeze on feature work in favor of reliability work.
- **Backups & Disaster Recovery:** All persistent data MUST be backed up on a defined schedule with defined RPO/RTO targets. Restores MUST be tested at least quarterly — an untested backup is not a backup. The interaction between backups and erasure requests MUST be documented (e.g., backup expiry windows and re-deletion on restore).
- **Incident Response:** A documented incident-response process is required: severity levels, on-call ownership, escalation paths, and status communication. Every SEV-1/SEV-2 incident MUST produce a blameless postmortem with tracked action items.

## 10. Observability
- **Structured Logging:** All services MUST emit structured JSON logs including a correlation/trace ID for request tracing. Logs MUST NOT contain secrets, credentials, or unredacted personal data.
- **Distributed Tracing & Metrics:** Services MUST emit traces and metrics via OpenTelemetry (or an equivalent open standard) so requests can be followed across service boundaries.
- **Health & Metrics Endpoints:** Every service MUST expose `/health` (liveness/readiness) and `/metrics` endpoints. Health endpoints MUST NOT leak internal configuration.
- **Error Tracking & Alerting:** All services MUST integrate with an error-tracking platform (e.g., Sentry) in staging and production. Alerts MUST be tied to SLOs and actionable — every page has a documented response; non-actionable alerts are deleted, not muted.
- **Audit Logging:** Security-relevant events (authentication, authorization changes, data exports, erasure requests, admin actions) MUST be written to an append-only audit log with defined retention, separate from application logs.
