# CONTRIBUTING.md — Engineering Rules & Review Policy

Status: **v1 (M0).** Binding for humans and AI agents alike. AI agents additionally follow [QWEN.md](./QWEN.md). When in conflict: SECURITY.md > ARCHITECTURE.md/PROJECT.md > this file > convenience.

## 1. Engineering rules (the "always" list)

1. **TypeScript-first** for all application code; `strict` compiler settings; no JS files in apps/packages except config shims.
2. **Strict typing at boundaries.** Public/internal APIs use zod-validated DTOs; inferred types, not hand-duplicated interfaces. `any` requires a justified lint-disable comment.
3. **Secure-by-default configuration.** New endpoints start authenticated + tenant-scoped + rate-limited unless explicitly marked public with review sign-off. Defaults must be the safe option (fail-closed).
4. **Secrets only via environment/secret manager.** Never in code, config files, fixtures, docs, or tests. `.env.example` placeholders only. gitleaks blocks violations mechanically.
5. **Validation at system boundaries** (HTTP, queues, webhooks, provider responses, env vars). Internal code may trust validated data only.
6. **Structured logging** via pino with request context; never `console.log` in server code (lint-enforced); PII/secrets redacted per SECURITY.md §3.
7. **Automated testing ships with behavior** per TESTING.md; bug fixes carry a reproduction test.
8. **Error handling**: typed domain errors mapped centrally to transport codes; no swallowed exceptions; user-facing messages generic, logs detailed with traceId.
9. **Dependency control**: new deps justified in PR description (purpose, alternative considered, maintenance/license check); prefer platform/workspace existing deps; lockfile changes reviewed as behavioral changes.
10. **Backwards compatibility where practical**: API changes additive; breaking changes need deprecation period, changelog entry, and an ADR if architectural; migrations always paired with tested rollback story.
11. **Docs move with code**: architecture-affecting change updates ARCHITECTURE.md/DECISIONS.md in the same PR; commands documented must be verified working first.
12. **Small, reviewable diffs** (~400-line norm); refactors separated from behavior changes into distinct commits/PRs.

## 2. Pull request flow

- Branch naming: `<type>/<issue>-<slug>` (e.g., `feat/123-agent-run-api`).
- PR template requires: linked issue, what/why, risk assessment (tenant-data? billing? security surface?), test evidence (commands run + results), doc updates made, screenshots for UI.
- CI green is necessary, not sufficient. Reviews are human by default; AI-generated PRs still require human reviewer approval before merge.
- Merge policy: squash, Conventional Commit subject auto-derived; rebase forbidden on shared branches.
- CODEOWNERS protects: `apps/gateway/src/adapters/**`, authz/policy modules, billing, sandbox provisioner, CI workflows, this file set. Changes there need senior/security review.

## 3. Architecture discipline

- Cross-module access only through exported services/ports; no deep imports into another module's internals (ESLint boundary rule enforces).
- Provider SDK imports allowed solely inside gateway adapters (custom lint rule). If you feel the urge elsewhere, the correct answer is extending the gateway contract.
- New ports/adapters pattern: define interface → default adapter → wire via DI token; document replacement intent in ARCHITECTURE.md §17 table row.
- Provisional choices are marked `(provisional)` in docs; converting one to final = ADR in DECISIONS.md.

## 4. Security responsibilities

- Treat generated code and user content as hostile inputs (SECURITY.md posture section).
- Any change touching authn/z, tenant scoping, secrets, egress, sandbox, or money paths gets security checklist applied in review (link SECURITY.md sections into PR body).
- Vulnerability discovered? Stop feature work, open private security issue, rotate affected credentials, write failing regression test first, then fix. Disclosure handled per incident runbook (to be added under `docs/runbooks/` in M1+).

## 5. Commit & style conventions

- Conventional Commits mandatory (commitlint enforced): `feat(api): ...`, `fix(gateway): ...`, `docs(readme): ...`.
- Subject ≤ 72 chars, imperative mood; body explains *why*, links issue.
- Code style: prettier output is law; discuss style by changing shared config, not per-file overrides.

## 6. For AI coding agents (summary — full protocol in QWEN.md)

Never claim success without running verification; inspect filesystem state before declaring completion; build/test after meaningful changes; preserve existing functionality; keep changes small and traceable; report failures honestly; when uncertain, read the repo instead of guessing. Violating these is worse than stopping to ask.

## 7. Milestone alignment

Work maps to ROADMAP.md milestones; out-of-scope improvements become issues, not drive-by edits. If reality forces scope change, update ROADMAP.md/PROJECT.md explicitly in a docs PR first.
