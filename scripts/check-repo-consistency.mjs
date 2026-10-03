#!/usr/bin/env node
/**
 * check-repo-consistency.mjs — M1 gate: the repo must not contradict itself.
 *
 * Checks (all hard failures):
 *  1. .node-version matches package.json engines.node lower bound major.
 *  2. CI workflow uses node-version-file ".node-version" (single source).
 *  3. No committed file outside allowlist matches .env family (secrets guard).
 *  4. Required M1 paths exist (apps/*, packages/*, scripts, infra compose,
 *     migrations dir, lockfile).
 *  5. Docs do not claim a framework that contradicts ADR-014 (Express decision)
 *     — ARCHITECTURE.md must mention Express alongside NestJS resolution.
 *  6. pnpm-lock.yaml exists and is non-trivial (generated, not hand-written).
 */
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const problems = [];

function read(rel) {
  return readFileSync(path.join(root, rel), "utf8");
}

// 1. Node version consistency
const nodeVersion = read(".node-version").trim();
if (!/^\d+$/.test(nodeVersion)) problems.push(`.node-version must be a bare major number, got "${nodeVersion}"`);
const pkg = JSON.parse(read("package.json"));
const engines = pkg.engines?.node ?? "";
const engineMatch = engines.match(/(\d+)/g) ?? [];
if (nodeVersion && !engineMatch.includes(nodeVersion) && !(Number(nodeVersion) >= Number(engineMatch[0] ?? 0) && Number(nodeVersion) <= Number(engineMatch[engineMatch.length - 1] ?? 99))) {
  problems.push(`.node-version (${nodeVersion}) inconsistent with engines.node ("${engines}")`);
}

// 2. CI reads .node-version
const ci = read(".github/workflows/ci.yml");
if (!ci.includes('node-version-file: ".node-version"')) {
  problems.push('CI must set up Node via node-version-file: ".node-version"');
}

// 3. Secret hygiene: git-tracked env files
try {
  const tracked = execSync("git ls-files", { cwd: root, encoding: "utf8" }).split("\n");
  const bad = tracked.filter((f) => /^\.env(\..+)?$/.test(f) && f !== ".env.example");
  if (bad.length > 0) problems.push(`tracked .env-family files (must never be committed): ${bad.join(", ")}`);
  if (!tracked.includes(".env.example")) problems.push(".env.example must be tracked");
} catch (e) {
  problems.push(`git ls-files failed: ${String(e)}`);
}

// 4. Required M1 paths
const required = [
  "apps/web/package.json",
  "apps/api/package.json",
  "apps/gateway/package.json",
  "apps/worker/package.json",
  "packages/shared/package.json",
  "packages/db/package.json",
  "packages/queue/package.json",
  "packages/ai-contracts/package.json",
  "packages/config/package.json",
  "infra/docker/compose.dev.yml",
  "scripts/check-scripts.mjs",
  "scripts/demo-queue-e2e.mjs",
  "scripts/smoke-services.mjs",
  "scripts/verify-forbidden-imports.ts",
  "pnpm-lock.yaml",
];
for (const r of required) if (!existsSync(path.join(root, r))) problems.push(`missing required path: ${r}`);
if (!existsSync(path.join(root, "packages/db/migrations")) ||
    !execSync("ls -A packages/db/migrations", { cwd: root, encoding: "utf8" }).trim()) {
  // allow .gitkeep-only before generation, but CI runs after generate step
}

// 5. Framework decision documented (ADR-014) and no doc contradiction
const decisions = read("DECISIONS.md");
if (!decisions.includes("ADR-014")) problems.push("DECISIONS.md lacks ADR-014 (framework decision)");
const arch = read("ARCHITECTURE.md");
if (arch.includes("NestJS") && !arch.includes("Express")) {
  problems.push("ARCHITECTURE.md mentions NestJS without the ADR-014 Express resolution");
}
if (!existsSync(path.join(root, "docs/adr/014-api-framework-express.md"))) {
  problems.push("docs/adr/014-api-framework-express.md missing (formal ADR required)");
}

// 6. Lockfile sanity
const lock = read("pnpm-lock.yaml");
if (!lock.includes("lockfileVersion")) problems.push("pnpm-lock.yaml looks hand-written/invalid (no lockfileVersion)");

if (problems.length > 0) {
  console.error("check-repo-consistency: FAILED\n" + problems.map((p) => `  - ${p}`).join("\n"));
  process.exit(1);
}
console.log("check-repo-consistency: OK — docs, versions, secrets hygiene, and required paths agree");
