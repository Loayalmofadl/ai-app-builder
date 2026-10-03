# TESTING.md — Testing Strategy

Status: **v1 baseline (M0).** Defines the testing pyramid, tooling, quality gates, and the security test suites that back SECURITY.md claims. Rule of engagement: *no feature merges without tests that actually run in CI; no doc claim is complete until its test exists.*

## 1. Principles

- Tests are part of the feature, not an afterthought. PRs adding behavior without a corresponding test need explicit reviewer sign-off recorded in the PR.
- Fast feedback first: unit < integration < e2e budgets (see §5 time limits).
- Determinism: no wall-clock dependence (inject clocks), no network in unit/integration tests (recorded fixtures / fakes), seeded randomness for agent tests.
- Isolation between tests: per-test transaction rollback or fresh container volumes as appropriate.
- We test *contracts* at module boundaries (ports), so infrastructure swaps don't rewrite suites (mirrors ARCHITECTURE §17).

## 2. Pyramid & layers

| Layer | Scope | Tools | Examples |
|---|---|---|---|
| **Unit** | pure functions, services with faked ports | Vitest | router scoring policy, credit math, path sanitizers, zod DTO schemas |
| **Component/contract** | NestJS modules with in-memory port fakes | Vitest + `@nestjs/testing` | guard chains, service↔repository port contracts, adapter translation tables |
| **Integration** | real Postgres+Redis via docker compose; adapters against recorded provider fixtures | Vitest projects + testcontainers-style compose harness | migrations apply cleanly, tenant-scoped queries, BullMQ job flows, gateway adapter request/response fidelity |
| **E2E** | full stack in browser | Playwright | signup→create project→agent run→preview renders→accept diff→rollback |
| **Security regression** | named suites per SECURITY.md §15 rows | Playwright/Vitest/custom harnesses | see §6 |
| **Performance/load** | k6 scenarios vs staging-like env | k6 | API p95 under load, queue drain rates, gateway failover timing |
| **Golden/replay (AI)** | agent pipeline vs recorded LLM outputs | Vitest snapshots | planner output → expected tool-call sequence; injection corpus pass/fail |

## 3. Tooling baseline

- Runner: **Vitest** (fast, ESM-native, shared config in `packages/config`).
- Coverage: V8 provider; target thresholds enforced per-package (see §5).
- API contract tests: OpenAPI schema generated from code checked into repo (`docs/api/*.openapi.json`) — breaking changes fail CI unless approved.
- DB: migrations tested by `up` then `down/drift` check on ephemeral instance; seeds versioned.
- Provider fixtures: HTTP recording proxy produces cassettes (like VCR) so gateway adapter tests hit deterministic files, never live APIs. Live-provider "canary" smoke runs nightly separately (not a merge gate).
- E2E: Playwright with per-run isolated tenant/project fixtures; parallel shards; video traces on failure artifacts.

## 4. What must always be tested (non-negotiable list)

1. Tenant isolation: every repository query used by product code has (or shares) a cross-tenant negative test.
2. AuthZ matrix: role × action table tests per guarded endpoint family.
3. Validation boundaries: each zod schema gets accept/reject cases incl. oversized/malformed inputs.
4. Money/credits: ledger arithmetic incl. concurrency (two workers decrement same balance ⇒ no overdraft).
5. Retry/idempotency: queue handlers run twice ⇒ same end state; provider error classes map to correct retry/fallback behavior.
6. Path safety: file tools reject `../`, absolute paths, symlink escapes, case-variant tricks.
7. SSRF: SafeFetchService rejects internal ranges, redirect-to-internal, DNS-rebind fixture.
8. Redaction: log capture asserts secrets never appear in serialized output.

## 5. Quality gates (CI)

Pipeline order (GitHub Actions): `secrets-scan → lint+typecheck → unit(+coverage) → integration → build → e2e(smoke subset) → security-suites → image scan`. Full e2e suite nightly + on release branch.

Budgets/thresholds (initial, adjust via ADR not silently):
- Unit+integration ≤ 8 min; typecheck+lint ≤ 3 min; smoke e2e ≤ 10 min.
- Coverage floor: statements ≥ 80% overall; **≥ 95% for billing/credits, authz/policy, path/file safety, gateway adapters**. New-code coverage (diff) ≥ 85%.
- Flaky-test quarantine max: 3 open issues (more blocks merges until fixed — flakiness is a defect).
- `pnpm audit --prod` high/critical fails; trivy critical fails; gitleaks any-hit fails.

## 6. Security test suites (map to SECURITY.md §15)

- `sec.tenant-isolation`: IDOR sweep across all endpoints with two tenants' credentials; asserts 403/404 and zero data bleed including search/list/export paths.
- `sec.auth`: session fixation/rotation, refresh reuse detection, OAuth state/PKCE enforcement, rate-limit lockouts.
- `sec.sandbox-escape`: attempts host fs read, docker socket, metadata IP (169.254.169.254), inter-sandbox connect, resource exhaustion (fork bomb/disk fill within quota ⇒ contained kill).
- `sec.ssrf`: fixture targets loopback/RFC1918/link-local/redirect chains/DNS rebinding mock.
- `sec.injection-corpus`: prompts embedding exfil/backdoor instructions run through agent pipeline with stubbed LLM ⇒ assert tool-layer blocks + flagged diff gating.
- `sec.secrets-hygiene`: static scan + runtime log capture assertions (§3 redaction).
- `sec.audit`: privileged ops produce audit rows (fail-closed verified by simulating audit-insert outage).

These run in CI (fast subsets) and nightly (full). Results labeled in releases.

## 7. AI-agent behavior testing (product-specific)

Because agent output is nondeterministic:
- **Contract tests:** given recorded provider cassette X, agent produces exactly tool-call sequence Y (golden files). Update goldens only via reviewed PR.
- **Property tests (fast-check):** router policies over randomized registries never pick disabled/unhealthy providers; credit estimator never negative.
- **Eval harness (post-M3):** rubric-scored sample generations (compiles? preview boots? prompt satisfied?) tracked as trend metric, not merge-blocking initially; becomes gate before GA marketing claims.
- **Cost budget assertion:** any test touching gateway uses fake pricing; unexpected spend pattern fails loudly.

## 8. Local workflow expectations

- `pnpm test` = unit+component; `pnpm test:integration` spins compose deps; `pnpm test:e2e` expects built apps. Pre-push hook runs fast subset (≤ 60s) — hooks may be skipped in emergencies but CI won't be.
- TDD encouraged for bug fixes: reproduction test lands first, referenced in PR body ("FAILS before fix" evidence line required).

## 9. Test data & environments

- Synthetic tenants/users/projects only in automated tests; PII never copied from prod to lower envs. Prod-anonymized datasets allowed only after retention-policy decision (PROJECT §8.5).
- Staging seeded via `packages/db/seeds` with deterministic IDs; synthetic monitor tenant runs hourly canary agent-runs against real providers (budget-capped) to catch provider drift early.

## 10. Release readiness checklist (testing view)

All §5 gates green · security suites green · migration dry-run on prod snapshot · rollback rehearsed · canary plan defined · known-flaky list published in release notes · observability dashboards for new features exist (a feature isn't done until it's observable AND tested).
