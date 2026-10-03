#!/usr/bin/env node
/**
 * check-scripts.mjs — repository gate (M1 scope items 6/9/12).
 *
 * Verifies:
 *  1. Every package.json "scripts" entry that references a repo-local file
 *     path (scripts/*.mjs, scripts/*.ts, eslint configs, vitest configs)
 *     points at a file that physically exists.
 *  2. The GitHub Actions workflow only invokes commands whose local file
 *     references exist.
 *  3. No workspace package.json is malformed JSON.
 *
 * Fails with a precise list of dangling references. Run via `pnpm verify:scripts`.
 */
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const problems = [];

function workspacePackageJsons() {
  const list = [path.join(root, "package.json")];
  for (const dir of ["apps", "packages"]) {
    const base = path.join(root, dir);
    if (!existsSync(base)) continue;
    for (const entry of readdirSync(base)) {
      const pj = path.join(base, entry, "package.json");
      if (existsSync(pj) && statSync(pj).isFile()) list.push(pj);
    }
  }
  return list;
}

// Matches tokens like scripts/foo.mjs, packages/config/eslint/x.mjs inside a
// script command string (paths must start with apps/|packages/|scripts/|infra/|fixtures/).
const PATH_RE = /(?:scripts|apps|packages|infra|fixtures)\/[\w./@-]+\.(?:mjs|cjs|ts|json|yml|yaml)/g;

for (const pj of workspacePackageJsons()) {
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(pj, "utf8"));
  } catch (e) {
    problems.push(`${path.relative(root, pj)}: invalid JSON (${String(e.message)})`);
    continue;
  }
  const relDir = path.dirname(pj);
  for (const [name, cmd] of Object.entries(parsed.scripts ?? {})) {
    if (typeof cmd !== "string") continue;
    for (const ref of cmd.match(PATH_RE) ?? []) {
      // Try relative to the package dir first, then repo root.
      const candidates = [path.join(relDir, ref), path.join(root, ref)];
      if (!candidates.some((c) => existsSync(c))) {
        problems.push(
          `${path.relative(root, pj)} script "${name}" references missing file: ${ref}`,
        );
      }
    }
  }
}

// CI workflow: same dangling-path scan on run: lines.
const wf = path.join(root, ".github/workflows/ci.yml");
if (!existsSync(wf)) {
  problems.push(".github/workflows/ci.yml is missing (M1 requires real CI)");
} else {
  const text = readFileSync(wf, "utf8");
  for (const ref of text.match(PATH_RE) ?? []) {
    if (!existsSync(path.join(root, ref))) {
      problems.push(`.github/workflows/ci.yml references missing file: ${ref}`);
    }
  }
}

if (problems.length > 0) {
  console.error("check-scripts: FAILED\n" + problems.map((p) => `  - ${p}`).join("\n"));
  process.exit(1);
}
console.log("check-scripts: OK — no dangling script or CI file references");
