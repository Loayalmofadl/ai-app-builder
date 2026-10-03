# DECISIONS.md — Architecture Decision Records (ADRs)

Format: short numbered records. Status ∈ {Accepted, Proposed, Superseded by X, Pending}. Accepted ADRs may be reversed only by a new ADR referencing the old one. "Pending" items are tracked decisions with owners/deadlines — nobody may implement them as if decided.

---

## ADR-001 — Documentation-first foundation (M0 before code)
**Status:** Accepted (2026-10-03). **Date:** 2026-10-03
**Context:** Long-term commercial product; risk of agents/humans building ad-hoc code that contradicts architecture.
**Decision:** No application code until README/PROJECT/ARCHITECTURE/SECURITY/TESTING/DEVELOPMENT/CONTRIBUTING/DECISIONS/ROADMAP/QWEN exist and pass a consistency review. Docs are versioned in-repo and updated alongside code forever after.
**Consequences:** Slower first line of code; dramatically lower rework risk; every future milestone has written exit criteria to verify against.

## ADR-002 — Provider independence is a core architectural constraint
**Status:** Accepted. **Date:** 2026-10-03
**Context:** Product must not depend on any single AI vendor (commercial leverage, outage resilience, model quality churn).
**Decision:** All LLM access via internal AI Gateway exposing normalized contracts (`packages/ai-contracts`) behind `LLMProviderAdapter` port. Callers request *model roles*, never vendor models. Enforcement: custom ESLint boundary rule + CODEOWNERS on adapters.
**Consequences:** Gateway becomes load-bearing infrastructure needing its own HA/reliability work; slight indirection cost per feature; vendor outages become routing events, not product incidents.

## ADR-003 — Modular monolith split into four processes
**Status:** Accepted. **Date:** 2026-10-03
**Context:** Microservices premature for team size; but sandbox/gateway have distinct scaling & isolation needs.
**Decision:** pnpm monorepo with NestJS modular monoliths deployed as separate processes: `web` (Next.js), `api` (core), `gateway` (AI), `worker` (async/agent/git/build). Shared packages hold contracts. Split further only when measurable need arises.
**Consequences:** Simple local dev + atomic cross-cutting changes; discipline needed to keep module boundaries honest (lint-enforced).

## ADR-004 — PostgreSQL + Drizzle ORM
**Status:** Accepted. **Date:** 2026-10-03
**Context:** Baseline mandates PostgreSQL. Need typed schema, reviewable SQL migrations, RLS support for tenant isolation defense-in-depth.
**Decision:** Drizzle ORM + drizzle-kit migrations in `packages/db`. Rejected Prisma (heavier abstraction, migration DX, less SQL visibility) and raw knex (more boilerplate). Repositories wrap Drizzle so engine swap stays contained.
**Consequences:** SQL literacy required of reviewers; excellent control over indexes/RLS; lockfile-light dependency.

## ADR-005 — First provider adapters: OpenAI, Anthropic, Qwen
**Status:** Accepted. **Date:** 2026-10-03
**Context:** Baseline names these three; Qwen offers OpenAI-compatible endpoint mode (DashScope) lowering adapter cost.
**Decision:** Implement `openai`, `anthropic`, `qwen` adapters against normalized contract; qwen adapter uses OpenAI-compat transport where capabilities allow, native where required (tokenizer/pricing differences handled inside adapter). Registry-driven capability flags prevent callers assuming features.
**Consequences:** Three-way conformance testing keeps the contract honest (contract test suite runs per adapter); future providers judged by whether they can satisfy the same contract.

## ADR-006 — Git engine: isomorphic-git in worker
**Status:** Accepted. **Date:** 2026-10-03
**Context:** Per-project versioning required; options: shell git binary (image bloat, exec surface), libgit2 bindings (native build/supply-chain risk), pure-JS isomorphic-git.
**Decision:** isomorphic-git executed in `worker`; bare repos persisted to object storage. Accept slower large-repo ops; mitigate with shallow working copies. Revisit if perf proves inadequate (new ADR then).
**Consequences:** No child_process git = smaller attack surface (generated-code platform!); pure-JS supply chain; performance ceiling documented.

## ADR-007 — Auth library candidate: Better Auth (spike-gated)
**Status:** Proposed → decision at M1 exit. **Date:** 2026-10-03
**Context:** Need email+password+OAuth+org membership primitives in NestJS; alternatives: Lucia-style DIY, NextAuth (frontend-coupled), commercial IdP (Auth0/Clerk — violates self-host/vendor-minimalism preference).
**Decision (proposed):** Evaluate Better Auth in M1 spike against checklist (session rotation, argon2id, TOTP path, multi-tenant claims mapping, export story). If it fails, fall back to hand-rolled session module (spec drafted during spike).
**Consequences:** Explicitly provisional; auth is too central to lock in blind. M1 cannot exit without this ADR resolved.

## ADR-008 — Deployment target: managed Kubernetes first
**Status:** Proposed → decision at M7 exit. **Date:** 2026-10-03
**Context:** Need network-isolated node pools for sandboxes, jobs for workers, staged rollouts. ECS simpler but couples us to AWS more deeply; k8s portable across clouds (aligns replaceability principle).
**Decision (provisional):** Managed k8s (EKS/GKE choice deferred) + Helm; revisit vs. ECS at M7 with real operational data. Terraform for resources.
**Consequences:** Ops expertise investment; portability preserved; sandbox node-pool isolation maps cleanly to SECURITY.md §8.

## ADR-009 — Turborepo for monorepo task orchestration
**Status:** Accepted. **Date:** 2026-10-03
**Context:** 4 apps + shared packages need cached, graph-aware builds/tests with pnpm workspaces.
**Decision:** Turborepo (Nx rejected as heavier/convention-coupling for NestJS+Next mix we already define ourselves). Remote cache enabled in CI from M1.
**Consequences:** One more tool; big CI/dev-loop speed win; task definitions centralized.

## ADR-010 — Redis for cache + BullMQ queues (no Kafka yet)
**Status:** Accepted. **Date:** 2026-10-03
**Context:** Workload = job dispatch + pub/sub + rate limits; event volumes modest pre-GA. Kafka buys durability/streaming we don't yet need at high ops cost.
**Decision:** Redis (managed or self-hosted) + BullMQ; queue wrappers in `packages/queue` form the replacement seam. Re-evaluate stream log (Kafka/Redpanda) when audit/event-sourcing scale demands (post-MVP).
**Consequences:** Simplicity now; acknowledged durability trade-off mitigated by idempotent jobs + Postgres state machine as truth.

## ADR-011 — Object storage S3-shaped interface (MinIO dev / S3-compat prod)
**Status:** Accepted. **Date:** 2026-10-03
**Context:** Blobs: file snapshots, git objects, build artifacts, exports. Avoid cloud-vendor lock-in contrary to replaceability principle.
**Decision:** `StoragePort` mirrors S3 API subset; MinIO locally, S3-compatible in prod (concrete host chosen with ADR-008 cloud decision).
**Consequences:** Multi-cloud portability; we maintain no exotic vendor features assumption.

## ADR-012 — Credits ledger lives in PostgreSQL; Redis advisory only
**Status:** Accepted. **Date:** 2026-10-03
**Context:** Billing correctness > throughput; must survive cache loss.
**Decision:** Atomic SQL decrement/insert ledger (`usage_records` + `credit_balances` with row locks/serializable transactions on balance updates); Redis counters used solely for fast pre-checks and rate limiting. Nightly reconciliation job compares gateway-metered totals vs ledger.
**Consequences:** Throughput cap acceptable at our scale; provable money-path correctness (TESTING.md §4.4).

## ADR-013 — Tenant model: organizations as tenants, single-DB shared schema + RLS
**Status:** Accepted. **Date:** 2026-10-03
**Context:** Options: schema-per-tenant, DB-per-tenant, shared-with-discriminator. Migration/maintenance complexity grows steeply with per-schema/DB approaches; isolation strength requirement achievable via enforced scoping + RLS + signed URLs.
**Decision:** Shared tables with mandatory `tenant_id`, repository-level scoping, RLS as second layer, object storage keys prefixed by tenant. Enterprise dedicated-instance later as deployment variant, not code fork.
**Consequences:** Blast radius of an isolation bug is severe ⇒ tenant-isolation security suite is permanent merge gate (TESTING.md §6).

## ADR-PENDING list (tracked, not decided)
| # | Question | Needed by | Notes |
|---|---|---|---|
| P-1 | Billing vendor (Stripe assumed) | M6 start | PROJECT.md §8.1 |
| P-2 | Sandbox microVM tier | M4 start | container baseline interim |
| P-3 | BYOK policy | M5 design | privacy + abuse implications |
| P-4 | Generated-app default template | M3 start | Vite+React assumed |
| P-5 | Prompt/completion retention | GA readiness | GDPR posture |
| P-6 | SSE vs WS default realtime | M3 start | SSE assumed |
