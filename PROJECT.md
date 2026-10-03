# PROJECT.md — Product Scope & Definition

Status: **Draft v1 (Foundation milestone M0)**. This document is the source of truth for *what* we are building. Architecture (*how*) lives in [ARCHITECTURE.md](./ARCHITECTURE.md).

## 1. Vision

A commercial SaaS platform that lets users build, run, and iterate on real software applications by describing them in natural language. The platform orchestrates AI agents that plan, generate code, execute it in isolated sandboxes, render live previews, and refine the result conversationally — with production concerns (auth, versioning, collaboration, billing, observability) built in from day one.

**Differentiator:** provider independence. No AI vendor is a load-bearing dependency. OpenAI, Anthropic, Qwen, and future providers are interchangeable at the request level via the Model Router.

## 2. Target users

- **Primary:** founders, indie hackers, and product teams building MVPs and internal tools without (or with limited) engineering capacity.
- **Secondary:** professional developers using the platform for scaffolding, prototyping, and repetitive feature work.
- **Tertiary (later):** agencies/teams needing multi-user workspaces with role-based access.

## 3. Core capabilities (full product, delivered across milestones)

1. **Prompt-to-app generation** — natural-language prompt → working project (initially web apps; Next.js/React templates first).
2. **Conversational iteration** — chat-driven edits to an existing project with diff review and rollback.
3. **Live preview** — generated app runs in a per-project sandbox with hot-reloaded preview URL.
4. **Project file management** — browsable/editable virtual file tree per project, persistent storage of artifacts.
5. **Versioning** — every agent commit is a Git snapshot; branch/tag/restore semantics.
6. **Publishing/deployment** — one-click deploy of a project to a managed runtime with custom domains (later).
7. **Accounts, orgs, roles** — email + OAuth sign-in; organizations as tenants; RBAC (owner/admin/member/viewer).
8. **Billing & credits** — subscription plans plus metered AI usage (credits per token band), usage dashboards, quotas.
9. **Admin/ops** — provider health, routing overrides, abuse controls, audit trail visibility.

## 4. Non-goals (explicit, current phase)

- Not implementing our own LLMs or inference hosting.
- Not a general-purpose IDE replacement (no local dev parity claims).
- Not supporting arbitrary backend languages in v1 sandboxes (Node/web first; more later).
- Not building mobile apps in v1.
- Not reselling provider APIs as a standalone gateway product (gateway is internal).
- No marketplace/plugin system until core loop is proven.

## 5. Terminology

| Term | Meaning |
|---|---|
| **Tenant / Organization** | Billing + isolation boundary. Owns projects, members, quotas. |
| **Project** | A user-created application artifact: files, git history, sandbox, metadata. Owned by exactly one tenant. |
| **Session** | One conversational build thread within a project (prompt stream + agent actions). |
| **Agent run** | One orchestrated execution of the plan→act loop producing commits/file changes. |
| **AI Gateway** | Internal service normalizing all LLM calls: auth, retries, cost metering, format translation. |
| **Model Router** | Policy layer choosing which provider/model serves a request (cost/quality/latency/health). |
| **Sandbox** | Ephemeral, isolated compute environment executing generated code for preview/builds. |
| **Preview** | User-visible running instance of a project inside its sandbox. |
| **Credit** | Internal metered unit consumed by AI usage (mapped from tokens/calls per model). |
| **Adapter** | Provider-specific implementation behind the gateway's `LLMProvider` interface. |

## 6. Success criteria (product-level)

- A user can go from prompt to shareable preview in < 10 minutes on first attempt.
- Adding a new AI provider requires only a new gateway adapter + router policy entry (no product-code changes).
- Zero cross-tenant data access incidents (verified by isolation tests, see [TESTING.md](./TESTING.md)).
- Every AI call is attributable to tenant/project/user with cost recorded.

## 7. Constraints & assumptions

- **Assumption:** B2B/B2C self-serve; card-on-file billing via Stripe (ADR-pending confirmation in M6 docs).
- **Assumption:** Generated code is untrusted input to our infrastructure at all times.
- **Constraint:** Technology baseline fixed in [DECISIONS.md](./DECISIONS.md): Next.js, TypeScript, NestJS, PostgreSQL, Redis, Docker, pnpm, Git/GitHub.
- **Constraint:** EU/US data residency considered but not committed for v1 (see SECURITY.md §Data governance).
- **Regulatory:** GDPR-style data deletion/export obligations for user content (planned, not yet designed).

## 8. Open questions (tracked, do not silently resolve)

1. Stripe vs. alternative billing vendor — decision needed before M6 (Billing).
2. Sandbox isolation tier: Firecracker vs. gVisor vs. hardened containers — decision needed before M4; foundation assumes "isolated container per project session" with upgrade path.
3. Do users bring their own API keys (BYOK)? Proposed yes as paid-tier feature; needs product decision.
4. Default template stack for generated apps (assumed Vite+React for speed; confirm in M3).
5. Data retention policy for prompts/completions (privacy review required before GA).

Answers to these must be recorded as ADRs in [DECISIONS.md](./DECISIONS.md) when resolved.
