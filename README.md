# Forge Platform

A production-grade, provider-agnostic AI application-building SaaS platform. Users describe software in natural language; the platform's agents plan, generate, and iteratively refine full application projects inside isolated sandboxes, with live preview, versioning, and billing — powered by an **AI Gateway** that abstracts OpenAI, Anthropic Claude, Qwen, and future providers behind a single internal API.

> **Status: Foundation milestone (M0).** This repository currently contains architecture and engineering documentation only — no application code has been implemented yet. See [ROADMAP.md](./ROADMAP.md) for the delivery plan and [PROJECT.md](./PROJECT.md) for scope.

## What this product is

- A multi-tenant SaaS where users create "projects" from prompts.
- An agent pipeline (plan → scaffold → generate files → run in sandbox → preview → iterate).
- Provider-independent: any LLM provider can be swapped or added without touching product code (see [ARCHITECTURE.md §AI Gateway](./ARCHITECTURE.md)).

## What this product is NOT (current phase)

- Not a working application. No endpoints, UI, or migrations exist yet.
- Not tied to any single AI vendor. Never introduce direct provider SDK calls outside the AI Gateway adapters.

## Documentation map

| Document | Purpose |
|---|---|
| [PROJECT.md](./PROJECT.md) | Product scope, goals, non-goals, terminology |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | System architecture: frontend, backend, data, AI Gateway, router, agents, sandbox, preview, git, auth, billing, observability, deployment |
| [SECURITY.md](./SECURITY.md) | Security requirements and controls (authn/z, tenant isolation, SSRF, sandbox, secrets, etc.) |
| [TESTING.md](./TESTING.md) | Testing strategy, layers, tooling, CI gates |
| [DEVELOPMENT.md](./DEVELOPMENT.md) | Local development environment, toolchain, workflow |
| [CONTRIBUTING.md](./CONTRIBUTING.md) | Contribution rules, review policy, engineering rules |
| [DECISIONS.md](./DECISIONS.md) | Architecture Decision Records (ADRs) |
| [ROADMAP.md](./ROADMAP.md) | Milestones M0–M9 and exit criteria |
| [QWEN.md](./QWEN.md) | Guidance for AI coding agents operating on this repo (rules of engagement) |

## Technology baseline (locked for foundation)

Next.js · TypeScript · NestJS · PostgreSQL · Redis · Docker · pnpm · Git/GitHub. See [DECISIONS.md](./DECISIONS.md) for rationale and each technology's designated role.

## Planned repository layout (monorepo, not yet created)

```
apps/
  web/          # Next.js frontend (marketing + app dashboard/IDE)
  api/          # NestJS backend (core API, auth, projects, billing)
  gateway/      # NestJS AI Gateway service (provider adapters, routing, metering)
packages/
  shared/       # Types, DTOs/schemas (zod), utilities — no business logic
  db/           # Drizzle schema + migrations (PostgreSQL)
  queue/        # BullMQ task definitions (Redis-backed)
  ai-contracts/ # Provider-agnostic request/response contracts for the gateway
infra/
  docker/       # Dockerfiles + compose for local dev
  deploy/       # Deployment configuration per environment
docs/           # Additional deep-dive docs (added in later milestones)
```

Module boundaries are enforced so infrastructure (DB, queues, storage, sandbox, AI provider) can be replaced behind interfaces. Rationale: [ARCHITECTURE.md](./ARCHITECTURE.md), [DECISIONS.md](./DECISIONS.md).

## Quick start

There is nothing to run yet (M0 is documentation-only). When M1 lands, `DEVELOPMENT.md` will contain verified bootstrap commands (`pnpm install`, `docker compose up`, `pnpm dev`). Do not add commands to this file until they have actually been tested.

## Security & secrets

Never commit secrets. All runtime configuration comes from environment variables validated at boot. See [SECURITY.md](./SECURITY.md) and [.env.example](./.env.example) (placeholders only).
