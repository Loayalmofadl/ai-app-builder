# ROADMAP.md — Milestones & Exit Criteria

Status: **v1 (M0).** Each milestone must be *implemented, tested, and verified* against its exit criteria before the next begins. No milestone is "done" because code exists — done means its checklist passes with evidence (CI runs, test names, reviewed docs). Ordering may change only via explicit PR updating this file.

Legend: 🚧 = current frontier. Prior milestones remain regression-guarded by CI forever after.

## M0 — Foundation ✅ (this commit)
Docs set complete: README, PROJECT, ARCHITECTURE, SECURITY, TESTING, DEVELOPMENT, CONTRIBUTING, DECISIONS, ROADMAP, QWEN + repo hygiene (.gitignore, .env.example placeholders, LICENSE policy, basic CI skeleton where possible).
**Exit criteria:** all 10 docs exist · cross-references consistent · no secrets · provisional choices marked & tracked as ADRs/pending · verification pass recorded in PR.

## M1 — Monorepo scaffold & walking skeleton
Create `apps/{web,api,gateway,worker}` + `packages/{shared,db,queue,ai-contracts,config}`, pnpm workspace + Turborepo, strict TS/ESLint/prettier/vitest presets, husky hooks (lint-staged, commitlint, gitleaks), docker compose dev stack (pg/redis/minio/mailpit), health endpoints wired web→api→gateway, first Drizzle migration (`users`, `organizations`, `org_members`), Better Auth spike resolving ADR-007, GitHub Actions pipeline per TESTING.md §5 order.
**Exit:** fresh clone → documented commands build/run green in CI; auth decision recorded; lint rules for module boundaries + provider-SDK ban active and demonstrated by a deliberate violation failing CI.

## M2 — Identity, tenants & project CRUD
Auth flows (email+password, OAuth, sessions/rotation), org creation/invites/RBAC, tenant-scoped repository base + RLS policies, projects/sessions CRUD API + minimal dashboard UI, audit_events foundation, rate limiting middleware, signed service tokens between processes.
**Exit:** `sec.tenant-isolation` + `sec.auth` suites passing on real endpoints; two-tenant demo proves isolation; OpenAPI published from code.

## M3 — AI Gateway v1 + Model Router v1
Normalized contracts, three adapters (OpenAI/Anthropic/Qwen) with cassette-based conformance tests, model registry + admin seeding, router with capability filter + health circuit-breaker + fallback, usage metering events → ledger tables (no UI yet), cost estimation, streaming passthrough, redaction-tested logging.
**Exit:** kill-provider-A mid-request ⇒ automatic failover observed in tests; every call produces correct `usage_records`; coverage ≥95% on adapters/router; P-4/P-6 decisions closed.

## M4 — Agent orchestration loop (text-only, fake sandbox first)
Worker `agent.runs` consumer, run state machine + resumability, tool framework (zod schemas, permission classes, budgets), fs/git tools operating on platform-side staging area, planner→act→validate loop with golden-cassette tests, SSE event stream to UI, diff review + accept/reject flow, git versioning (isomorphic-git, branches/tags per ARCHITECTURE §12).
**Exit:** prompt → multi-file generated app committed to branch → human accepts diff → rollback works; injection-corpus suite blocks exfil-style tool calls at layer boundary; crash-resume test passes.

## M5 — Sandbox execution & live preview
`SandboxRuntimePort` + container adapter (hardening baseline per SECURITY §8), lifecycle queue (create/idle-teardown/rebuild-from-ref), file sync bridge with path sanitization, dev-server proxy with signed preview tokens, console/log streaming, build job reuse of runtime. P-2 microVM evaluation written up.
**Exit:** `sec.sandbox-escape` suite green (metadata IP blocked, inter-sandbox blocked, quotas enforced); generated Vite app previews live with HMR refresh signal; idle teardown verified.

## M6 — Billing, credits & plans end-to-end
BillingPort + Stripe adapter (P-1 resolved here or superseded), checkout/webhooks (signature-verified), plan config → entitlements/rate caps, credit purchase/grants/expiry, pre-flight + mid-run enforcement, usage dashboards, reconciliation job + alerts, invoice views.
**Exit:** money-path concurrency tests prove no overdraft; webhook replay attack rejected; spend ceiling kills runaway agent run gracefully; ledger reconciles vs gateway totals over synthetic day.

## M7 — Operations hardening & deployment
Terraform + Helm/k8s (ADR-008 resolved), staging environment w/ seeded synthetic tenants, OTel traces→collector, Grafana dashboards + alert rules per ARCHITECTURE §15, backup/restore automation + drill, incident runbooks (key compromise, isolation breach, provider outage), load tests (k6) with capacity report, image scanning/SBOM gates live.
**Exit:** deploy+rollback rehearsal timed; SLO dashboards exist; one full game-day incident executed on staging; canary monitor tenant running hourly.

## M8 — Publishing & collaboration polish
DeployTargetPort adapter for published apps (domains, SSL), share links, multi-user project roles UX, GitHub import/export mirror, email notifications, admin console (provider health, routing pins, moderation queue).
**Exit:** user publishes generated app to https URL they own; GitHub round-trip preserves history; admin pin override audited.

## M9 — GA readiness
Pen-test remediation cycle, privacy: data export/deletion self-service + retention policy implemented (P-5), subprocessor list, ToS/DPA finalized, onboarding funnel polish, support tooling (impersonation with consent + audit), scale-out load validation, marketing-site content real.
**Exit:** SECURITY.md §14 operational checklist fully green with external review sign-off.

## Cross-cutting backlog (continuous, never "a phase")
Dependency updates/Renovate hygiene · flake budget enforcement · doc freshness checks in CI · chaos drills for gateway failover · cost/margin monitoring tuning · accessibility audits on web.

## Explicitly out-of-scope until post-MVP
Real-time collaborative editing (CRDT), mobile app generation, non-JS language sandboxes, plugin marketplace, white-label program, fine-grained resource sharing beyond org roles.
