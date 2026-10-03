# DEVELOPMENT.md — Local Development & Workflow

Status: **v1 (M0).** Describes the intended developer environment. Commands marked **(planned)** do not exist yet and must not be presented as working until M1 verifies them. Keep this file honest: update it in the same PR that makes a command real.

## 1. Prerequisites

| Tool | Version | Notes |
|---|---|---|
| Node.js | ≥ 20 LTS (22 recommended) | pinned via `.nvmrc`/`.node-version` (planned M1) |
| pnpm | latest 9.x, via Corepack | `corepack enable` — never install pnpm ad hoc |
| Docker | 24+ with compose v2 | runs Postgres, Redis, MinIO, Mailpit locally |
| Git | 2.40+ | GitHub auth via SSH or PAT (fine-grained, minimal scopes) |
| OS | Linux/macOS (WSL2 for Windows) | sandbox dev features assume Linux containers |

## 2. Repository layout (target; created in M1)

```
apps/web apps/api apps/gateway apps/worker
packages/shared packages/db packages/queue packages/ai-contracts packages/config
infra/docker infra/deploy docs
pnpm-workspace.yaml turbo.json .github/workflows
```

- Task orchestration: **Turborepo** (`pnpm build|dev|test|lint|typecheck` fan-out with caching). (ADR-009, planned)
- Shared TS config, ESLint, prettier, vitest presets live in `packages/config` so policy is one-place-changeable.

## 3. First-run workflow (planned M1 — verify before trusting)

```bash
git clone <repo> && cd forge
corepack enable && pnpm install          # lockfile-frozen by default
cp .env.example .env                     # fill local placeholders only
docker compose -f infra/docker/compose.dev.yml up -d   # pg, redis, minio, mailpit
pnpm db:migrate && pnpm db:seed          # applies packages/db migrations, demo tenant
pnpm dev                                 # turbo: web :3000, api :3001, gateway :3002, worker
```

Mailpit at `:8025` captures dev email. MinIO console `:9001` for blobs. Never point local dev at shared/staging infrastructure.

## 4. Environment variables

- Single source of truth: `packages/shared/env` zod schema; every app boots through it; missing/invalid ⇒ refusal to start with precise error (no silent defaults for secrets).
- `.env.example` lists every variable with placeholder values and comments (it is checked; keep it current in the same PR that adds a var).
- Naming: `FORGE_<APP>_<NAME>` for app-specific, `DATABASE_URL`, `REDIS_URL`, provider keys `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `QWEN_API_KEY` (gateway-only reads these — enforced by deploy config, not code review memory).
- Local secrets stay in `.env`; staging/prod come from secret manager (`SecretsPort`). No personal tokens ever committed.

## 5. Coding standards (summary; full rules in CONTRIBUTING.md)

- TypeScript `strict: true`, `noUncheckedIndexedAccess`, no `any` without justified `// eslint-disable-next-line @typescript-eslint/no-explicit-any` + comment.
- ESM everywhere; imports via workspace package names, not deep relative paths across apps.
- NestJS conventions: constructor DI only, no global mutable singletons, DTOs + pipes at controllers, domain errors thrown as typed classes mapped centrally to HTTP codes.
- Zod schemas exported alongside types they produce (`z.infer`) — one definition per boundary shape.
- Errors: expected failures = typed domain errors; unexpected = logged with traceId, generic client response. Never swallow (`catch {}` banned by lint).
- Logging: pino child-loggers with request context; human-readable pretty transport only in dev.

## 6. Quality toolchain

- Lint: ESLint flat config + typescript-eslint strict-type-checked; custom rule banning provider SDK imports outside `apps/gateway/src/adapters/**` (SECURITY/ARCHITECTURE guarantee).
- Format: prettier (config in `packages/config`); import sorting automatic.
- Hooks: husky + lint-staged (pre-commit), commitlint (Conventional Commits), gitleaks pre-push.
- CI mirrors local commands exactly (same turbo targets) so "works on my machine" is structurally true.

## 7. Database workflow

- Schema lives in `packages/db/schema`; migrations generated with drizzle-kit into `packages/db/migrations` — reviewed like code (SQL diff visible in PR).
- Branch-safe: never edit applied migrations; add new ones. Local reset via `pnpm db:reset` (destructive, dev-only guard inside script).
- Seeds: deterministic IDs; include two demo tenants so isolation bugs are obvious during manual QA.

## 8. Debugging & profiling

- Node inspector via `pnpm dev:inspect`; VS Code compound launch config (planned M1 in `.vscode/`).
- Queue introspection: Bull Board mounted at `/admin/queues` in non-prod only (auth-guarded even there).
- Gateway request tracing: every call logs normalized request ID ↔ provider request ID for correlation with provider dashboards.
- DB: `pg_stat_statements` enabled in dev/staging compose; slow-query threshold 100ms logged as warn.

## 9. Dependency management

- Add deps deliberately: check maintenance, size, license (MIT/Apache/BSD preferred; copyleft needs approval), and whether an existing dep covers it.
- Renovate PRs: squash per ecosystem, run full CI, read release notes link in PR body before merge.
- Lockfile conflicts: resolve by re-running `pnpm install` on updated base branch, never hand-editing `pnpm-lock.yaml`.

## 10. Branching & releases

- Trunk-based: short-lived branches from `main`; feature flags (DB-backed, per-tenant capable) for anything risky; `release/*` cut for stabilization; semver tags drive deploys.
- Conventional Commits (`feat|fix|chore|docs|refactor|perf|test|ci|build(scope): subject`) → automated changelog + release notes.
- Every merged PR must reference an issue; milestones tracked per ROADMAP.md.

## 11. Definition of Done (developer checklist)

Code works locally · tests added & passing (per TESTING.md expectations) · typecheck/lint clean · env vars documented in `.env.example` · audit/logging considered for sensitive paths · docs updated if behavior/architecture changed · no secrets in diff · PR small enough to review seriously (< ~400 line norm).
