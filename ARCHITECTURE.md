# ARCHITECTURE.md — System Architecture

Status: **v1 (Foundation milestone M0)** — target architecture, not yet implemented. Every subsystem below has interfaces defined here and is implemented in later milestones per [ROADMAP.md](./ROADMAP.md). Where a choice is provisional, it is marked **(provisional)** and tracked in [DECISIONS.md](./DECISIONS.md) / PROJECT.md §8.

## 0. Architecture principles

1. **Provider independence.** All LLM traffic flows through the AI Gateway. No product module may import a provider SDK directly (enforced by lint rule + review).
2. **Replaceable infrastructure.** Database, queue, object storage, sandbox runtime, and deployment target are each behind a port (interface) with at least one adapter. Swapping infra = new adapter + config, not a rewrite.
3. **Modular monolith first, services where justified.** One codebase (pnpm monorepo), independently deployable processes only where scaling/security boundaries demand it: `web`, `api`, `gateway`, `worker`. (ADR-003)
4. **Untrusted-code containment.** Generated/user code never executes inside platform processes. It runs only in sandboxes with no platform credentials and default-deny egress.
5. **Tenant isolation is architectural, not incidental.** `tenant_id` is present on every domain row, enforced at the data-access layer, and re-checked at every API boundary.
6. **Validate at boundaries.** Every external input (HTTP, queue payloads, webhooks, provider responses) passes schema validation (zod) before entering domain code.
7. **Everything observable.** Structured logs, metrics, traces, and audit events from the first service that exists.

## 1. System overview

```
                    ┌─────────────────────────────────────────────────────┐
                    │                        Users                        │
                    └───────────────┬─────────────────────────────────────┘
                                    │ HTTPS
                          ┌─────────▼──────────┐
                          │   apps/web         │  Next.js (App Router, RSC)
                          │   dashboard/IDE    │  auth sessions, SSE/WebSocket client
                          └─────────┬──────────┘
                                    │ REST + SSE/WS (via BFF routes)
        ┌───────────────────────────▼────────────────────────────┐
        │                     apps/api (NestJS)                  │
        │  Auth · Tenants · Projects · Files · Versions · Agent  │
        │  Orchestration API · Billing hooks · Admin · Audit     │
        └───────┬───────────────┬───────────────┬───────────────┘
                │               │               │
      ┌─────────▼───┐   ┌───────▼──────┐  ┌─────▼──────────────┐
      │ PostgreSQL  │   │    Redis     │  │ Object Storage(S3- │
      │ (Drizzle)   │   │ cache+queues │  │ compatible iface)  │
      └─────────────┘   └───────┬──────┘  └────────────────────┘
                                │ BullMQ jobs
                    ┌───────────▼────────────┐
                    │   apps/worker (NestJS) │  Agent runner, git ops, build tasks
                    └──┬────────────┬────────┘
                       │            │
          ┌────────────▼───┐   ┌────▼─────────────────┐
          │ apps/gateway   │   │ Sandbox runtime       │
          │ (NestJS)       │   │ (container-per-       │
          │ AI Gateway +   │   │  session, provisioner │
          │ Model Router   │   │  interface)           │
          └──┬────┬────┬───┘   └────┬─────────────────┘
             │    │    │            │ preview proxy (via api)
     ┌───────▼┐ ┌─▼──┐ ┌▼────────┐  │
     │ OpenAI │ │Claude│ │ Qwen / │ ◄─ adapters, pluggable
     └────────┘ └────┘ └Others…─┘
```

Processes: **web** (browser/server-rendered UI), **api** (core business API), **gateway** (provider-normalizing AI gateway), **worker** (async agent/job execution). Shared packages define contracts between them.

## 2. Frontend (`apps/web`)

- **Stack:** Next.js (App Router, React Server Components), TypeScript strict. Client components for editor/chat surfaces.
- **Responsibilities:** marketing site; authenticated dashboard; project workspace (chat panel, file tree, code editor via Monaco, live preview iframe, diff viewer, version timeline).
- **Data access:** browser never calls `api`/`gateway` cross-origin directly. Next.js route handlers act as BFF: attach session, forward to core API with a service token, stream SSE (agent events) and WebSocket (preview console/logs) to the client.
- **State:** server state via TanStack Query; minimal client state; URL is source of truth for navigation/selection.
- **Realtime:** agent-run progress via SSE (simpler infra) with WebSocket reserved for interactive terminal/console. (provisional)
- **Styling:** Tailwind CSS + shadcn/ui primitives. (provisional)

## 3. Backend/API (`apps/api`, NestJS)

- **Shape:** NestJS modular monolith. Each domain area is a Nest module with `controller → service → repository(port)` layering. Cross-module calls go through exported service interfaces only (no reaching into internals).
- **Modules (initial set):** `auth`, `tenants`, `users`, `projects`, `files`, `versions(git)`, `sessions`, `agent-orchestration`, `previews`, `billing`, `usage-metering`, `admin`, `audit`, `notifications`.
- **API style:** REST (OpenAPI generated from annotated DTOs), JSON, zod-validated DTOs at boundary, cursor pagination, idempotency keys on mutating endpoints that trigger side effects.
- **Async contract:** `api` enqueues BullMQ jobs (Redis) for anything > request-latency work (agent runs, builds, exports). Workers write results back to Postgres and publish events; `api` relays to clients over SSE.
- **AuthN/AuthZ middleware:** global guards — session/JWT verification guard, tenant-context guard (loads membership, attaches `tenantId`+`role` to request), RBAC guard, rate-limit guard. Handlers must never trust client-supplied tenant IDs.

## 4. Database

- **Engine:** PostgreSQL 15+ (single primary; read replicas added when needed). Access via **Drizzle ORM** + SQL migrations (drizzle-kit). (ADR-004)
- **Core entities (planned schema, M1+):**
  - Identity/billing: `users`, `organizations` (=tenant), `org_members(role)`, `subscriptions`, `plans`, `credit_balances`, `usage_records`, `invoices_ref`
  - Product: `projects(tenant_id, name, template, status)`, `project_files(tenant_id, project_id, path, blob_ref, content_hash)`, `sessions`, `messages`, `agent_runs(status, steps, cost_credits)`, `git_refs(tenant_id, project_id, branch, commit_sha)`, `previews(sandbox_id, url, expires_at)`
  - Ops/security: `audit_events`, `api_keys`, `rate_limits`, `provider_health_snapshots`
- **Isolation rules:** every tenant-owned table carries `tenant_id NOT NULL`; composite indexes lead with `tenant_id`; repository base class injects tenant scope; Row-Level Security policies as defense-in-depth once multi-tenant queries exist (M2).
- **Large blobs:** file contents stored in object storage (content-addressed by hash); DB stores metadata + refs. Small files (<64KB) may inline during early milestones for simplicity. (provisional)
- **Replaceability:** all persistence behind repository ports in `packages/db`; raw SQL confined to migration files. A future engine change touches adapters only.

## 5. Cache & queues (Redis)

- **Roles:** (a) short-lived cache (sessions, provider health, plan config) with explicit TTLs — cache is never source of truth; (b) **BullMQ** queues for background work; (c) pub/sub fan-out of agent-run events to SSE connections; (d) distributed rate-limit counters (sliding window).
- **Queues (initial):** `agent.runs`, `project.builds`, `sandbox.lifecycle`, `billing.metering`, `notifications`, `cleanup.expired-previews`.
- **Job rules:** idempotent handlers (job ID = domain event ID), bounded retries with exponential backoff + dead-letter queue, per-tenant concurrency caps so one tenant cannot starve others.
- **Replaceability:** producers/consumers use wrappers in `packages/queue`; swapping Redis→SQS/RabbitMQ later changes only that package.

## 6. AI Gateway (`apps/gateway`)

Single internal surface for all LLM usage. Consumers: worker (agent calls), api (title generation, embeddings, moderation). Nothing else talks to providers.

- **Contract (`packages/ai-contracts`):** normalized request `{ modelRole, messages, tools?, temperature, maxTokens, stream }` and response `{ text|toolCalls, usage{inputTokens,outputTokens}, finishReason, providerMeta }`. Streaming via SSE internally.
- **Adapter interface (port):**
  ```ts
  interface LLMProviderAdapter {
    id: string;                                   // 'openai' | 'anthropic' | 'qwen' | ...
    capabilities(): { streaming: boolean; tools: boolean; vision: boolean; jsonMode: boolean };
    listModels(): Promise<ModelInfo[]>;
    complete(req: NormalizedChatRequest, ctx: GatewayCtx): AsyncIterable<NormalizedChunk>;
    estimateCost?(req, model): CreditEstimate;
  }
  ```
  Adapters own: auth headers, payload translation, tool-call format mapping, error-class mapping (rate-limit vs. overload vs. invalid), and usage extraction. First adapters: OpenAI, Anthropic, Qwen (DashScope/OpenAI-compatible mode). (ADR-005)
- **Cross-cutting gateway concerns:** API-key issuance to internal services, per-tenant rate limits, request/response schema validation, timeout + retry-with-backoff (only on retryable classes), fallback across providers, response caching for identical cheap calls, prompt/completion logging policy (redaction + retention flags), centralized cost metering → `usage_records`.
- **Model registry:** DB-backed table `models(id, provider, role_tags, pricing_in/out, caps, enabled)` so adding/retiring models is configuration + adapter, not code in callers.

## 7. Model Router (policy layer inside gateway)

- **Input:** a *model role* requested by callers (e.g. `agent-planner`, `code-gen-large`, `fast-cheap`, `embeddings`) — callers never name concrete vendor models.
- **Decision pipeline:** candidate set by capability → filter by health circuit-breaker → score by policy weights (cost ceiling, latency p50, quality tier, tenant plan constraints, BYOK if present) → pick primary + ordered fallbacks.
- **Health:** rolling success-rate/latency windows per provider; open circuit ⇒ auto-failover; admin override pins available (audited).
- **Determinism/testing:** routing decisions logged with full rationale snapshot; deterministic "shadow mode" evaluation before promoting new policies.
- **Replaceability:** router is a pure policy module; changing strategy = new scoring function, contracts unchanged.

## 8. Agent orchestration

- **Location:** orchestrated by `apps/worker` consuming `agent.runs` jobs; `api` exposes run lifecycle (start/status/cancel) and streams events.
- **Loop:** `context-builder → planner(LLM) → step executor (tool calls) → validator → commit/diff → respond`. Tools are typed: `fs.read/write/patch`, `shell.exec(in sandbox)`, `git.commit`, `preview.reload`, `web.fetch(allowlisted)`, `ask-user`. Each tool declares arg schema (zod), permission class, and budget impact.
- **Guardrails:** max steps/tokens/cost per run (from plan config); loop detection; every mutation staged in a git branch then surfaced as a reviewable diff; destructive ops (delete file, reset) require confirmation flag set by policy.
- **State:** run state machine persisted in Postgres (`queued → running → awaiting_user | succeeded | failed | cancelled`), resumable after worker restart (event-sourced step log).
- **Prompt-injection stance:** user prompts and generated-file contents are treated as untrusted data within tool results; system/tool-policy layers separate; tool allowlist enforced outside the LLM (see SECURITY.md §Prompt injection).

## 9. Project/file management

- **Canonical store:** Git repository per project (see §11) + object-storage snapshots. Working copy materialized into the sandbox on demand.
- **File service (api):** CRUD against current HEAD-ish state; writes create commits (user edits) or land on agent branches; path normalization + traversal rejection at service boundary; binary detection; size/type limits; `.env`/secret-pattern scanning on write (SECURITY.md).
- **Concurrency:** optimistic concurrency via content hash/base-commit checks; last-writer conflicts resolved by rebasing agent patches onto user edits deterministically. (provisional)

## 10. Sandbox execution

- **Threat model:** executes arbitrary AI-generated/user-requested code. Assume malicious.
- **Design:** `SandboxRuntimePort` interface (`create/destroy/exec/fsSync/proxyEndpoint/status`). Default adapter: **one container per active project session**, non-root, read-only root FS overlay, dropped capabilities, seccomp+AppArmor, CPU/mem/pid/disk quotas, tmpfs workdir, no docker.sock, network default-deny with egress proxy allowlist (npm registry, docs domains). (isolation tier provisional — PROJECT.md §8.2)
- **Lifecycle:** created lazily on first run; idle-timeout teardown (default 30 min); rebuildable from git ref at any time ⇒ disposable, never hand-migrated.
- **Dev server:** sandbox runs template's dev server; platform proxies ports to preview URLs (§12). Build/export jobs reuse same runtime with stricter, batch-oriented profile.

## 11. Preview/runtime

- **Preview URL scheme:** `https://<projectId>-<runId>.previews.<domain>` routed by `api` preview-proxy → sandbox endpoint. Proxy enforces per-preview auth (signed preview tokens), strips platform cookies, CSP `frame-ancestors` to our origins.
- **Live update flow:** agent commit → worker syncs files into sandbox → dev-server HMR reloads → SSE notifies frontend to refresh iframe/console; stdout/stderr streamed back through the proxy channel into the UI console.
- **Published deployments (later milestone):** promote a git tag to an immutable build artifact deployed via the `DeployTargetPort` (adapter: static/Node hosting — provider TBD, see ROADMAP M8).

## 12. Git/versioning

- **Engine:** `isomorphic-git` (pure JS, no native deps) executed in `worker`; bare repos stored in object storage; per-project single repo. Alternative considered: libgit2 bindings — rejected for supply-chain/native-build risk (ADR-006).
- **Model:** `main` holds accepted state; each agent run works on `agent/<runId>` branch; accepting a diff fast-forwards/merges into `main`; rollback = reset to prior tagged commit (`v<n)` auto-tag per acceptance). User edits commit directly to `main` under optimistic lock.
- **Integrity:** signed commits not used (platform identity is the signer via guarded key); commit authorship records `(userId|agent:runId, tenantId)`; history rewrite forbidden — GC only prunes unreachable agent branches.
- **Export/import:** zip/git-bundle download anytime (foundation guarantee: no lock-in). GitHub sync (push/pull mirror) is a later-milestone feature using scoped fine-grained tokens.

## 13. Authentication & authorization

- **Identity:** email+password (argon2id hashes) and OAuth (Google/GitHub) via **Better Auth** library in `api` (candidate; validated in M1, ADR-007). Session cookie (HttpOnly, Secure, SameSite=Lax) + short-lived JWT for programmatic contexts; refresh rotation. PATs for API access with scopes.
- **Authorization:** RBAC within tenant: `owner/admin/member/viewer`; resource-level checks in services (project visibility ⊂ org membership). Central `PolicyService` consulted by guards — no ad-hoc role checks in controllers.
- **Platform-to-platform:** `api↔gateway` and `worker↔gateway` use mTLS or rotating service tokens (deploy-configurable); sandbox→platform uses narrowly-scoped, run-bound tokens only.
- Full requirements in [SECURITY.md](./SECURITY.md).

## 14. Billing / usage / credits

- **Flow:** every gateway call emits a `UsageEvent(tenant,user,project,run,model,tokens,costCredits)` → `billing.metering` queue → `usage_records` + credit decrement (atomic SQL, single source of truth = Postgres; Redis only for fast quota pre-checks).
- **Enforcement:** pre-flight credit check at agent-run start; hard stop mid-run at exhaustion (graceful: finish current step, mark run `blocked_credit`); plan-based concurrency + rate caps.
- **Subscriptions:** billing provider adapter (`BillingPort`: Stripe assumed, replaceable) for plans/seats/checkout/webhooks; webhook signature verification mandatory; entitlements synced to `subscriptions` table; invoices surfaced in dashboard.
- **Pricing model:** credits ≈ f(tokens × per-model multiplier); margin configurable per model in registry. Provider price changes are registry updates, not code changes.

## 15. Observability

- **Logs:** structured JSON (pino), request-correlation: `traceId`, `tenantId`, `projectId`, `runId` bound contextually. Redaction list for secrets/PII fields.
- **Metrics:** Prometheus-format RED metrics per endpoint/queue/provider; LLM-specific: tokens, cost, latency, provider error-class counts, router failovers.
- **Tracing:** OpenTelemetry SDK everywhere; propagate W3C traceparent web→api→queue→worker→gateway→provider span; queue hops carry context in job payloads.
- **Alerting/SLOs (initial):** API p95 latency, availability, provider error-rate spikes, DLQ depth, credit-ledger reconciliation mismatch. Stack: Grafana Cloud or self-hosted LGTM (provisional).
- **Audit:** security-relevant events (auth, membership, role change, data export, admin actions, secret access) written to append-only `audit_events`.

## 16. Deployment

- **Containers:** multi-stage Dockerfile per app; distroless node runtime; reproducible builds via pnpm lockfile + `--frozen-lockfile`; image scanning (trivy) in CI.
- **Local dev:** `docker compose` (postgres, redis, mailpit, minio for S3-compat storage) + `pnpm dev` for apps.
- **Staging/production (provisional, ADR-008):** managed Kubernetes (or ECS) with Helm charts per environment; Terraform-managed cloud resources; migrations run as gated release job with automatic backup pre-deploy. Zero-downtime rollouts; instant rollback to previous image.
- **Environments:** `dev` (local) → `staging` (full-stack, synthetic tenants) → `prod`. Config strictly via env vars + secret manager (Vault/Cloud SM adapter — `SecretsPort` keeps it swappable).
- **Sandbox hosts:** separate node pool/VPC subnet from platform services; no path from sandbox network to prod DB/Redis.

## 17. Replaceability matrix (summary of ports)

| Concern | Port (interface) | Default adapter | Replacement cost |
|---|---|---|---|
| LLM provider | `LLMProviderAdapter` | OpenAI / Anthropic / Qwen | New adapter file + registry row |
| Database | repository ports (`packages/db`) | PostgreSQL+Drizzle | New driver/migrations |
| Queue/cache | `packages/queue` wrappers | Redis+BullMQ | New wrapper backend |
| Object storage | `StoragePort` (S3-shaped) | MinIO/S3-compatible | Config or thin adapter |
| Sandbox runtime | `SandboxRuntimePort` | Docker-container adapter | Firecracker/gVisor adapter |
| Billing | `BillingPort` | Stripe (pending ADR) | New adapter + webhook handler |
| Auth | Better Auth (swappable core) | Email+OAuth | Library/config swap in M1 spike |
| Secrets | `SecretsPort` | Env/Vault adapter | Config |
| Deploy target | `DeployTargetPort` | TBD (M8) | New adapter |

## 18. What is explicitly NOT decided

Recorded so nobody "helpfully" invents answers: billing vendor (M6), sandbox microVM tier (M4), k8s vs ECS (first deploy milestone), BYOK policy (product), EU residency (compliance review), real-time collab editing CRDT choice (post-MVP). See PROJECT.md §8 and DECISIONS.md pending entries.
