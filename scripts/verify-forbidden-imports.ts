/**
 * verify-forbidden-imports.ts — provider boundary enforcement demonstration
 * (M1 scope item 4 / ROADMAP M1 exit criterion: "deliberate violation fails").
 *
 * Runs the forge/forbidden-provider-imports ESLint rule over two fixtures:
 *   1. fixtures/forbidden-import/violation.ts     — MUST produce errors
 *   2. apps/gateway/src/adapters/index.ts         — MUST produce zero errors
 *      (the rule's allowPaths permits provider imports inside the adapter zone)
 *
 * Exits non-zero if the gate ever stops catching violations or starts
 * false-positiving on allowed code. Never weaken this to make CI green.
 */
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

interface LintResult {
  filePath: string;
  messages: Array<{ ruleId: string | null; message: string }>;
}

function eslintJson(files: string[]): LintResult[] {
  const out = execFileSync(
    path.join(root, "node_modules/.bin/eslint"),
    ["--config", "packages/config/eslint/forbidden-imports.eslint.config.mjs", "--no-config-lookup", "-f", "json", ...files],
    { cwd: root, encoding: utf8(), maxBuffer: 32 * 1024 * 1024 },
  );
  return JSON.parse(out) as LintResult[];
}

function utf8(): BufferEncoding {
  return "utf8";
}

function violationsIn(results: LintResult[]): number {
  return results.reduce(
    (n, r) => n + r.messages.filter((m) => m.ruleId === "forge/forbidden-provider-imports").length,
    0,
  );
}

let failed = false;

// 1. Deliberate violation fixture must be caught.
try {
  const res = eslintJson(["fixtures/forbidden-import/violation.ts"]);
  const count = violationsIn(res);
  if (count >= 3) {
    console.log(`PASS: forbidden-import gate caught ${String(count)} violations in violation.ts`);
  } else {
    console.error(`FAIL: expected >=3 violations in violation.ts, got ${String(count)}`);
    failed = true;
  }
} catch (e) {
  // eslint exits non-zero when there are errors — that is the success case.
  const err = e as { stdout?: string };
  if (err.stdout) {
    try {
      const parsed = JSON.parse(err.stdout) as LintResult[];
      const count = violationsIn(parsed);
      if (count >= 3) {
        console.log(`PASS: forbidden-import gate caught ${String(count)} violations in violation.ts (eslint exited non-zero as required)`);
      } else {
        console.error(`FAIL: eslint errored but only ${String(count)} boundary violations reported`);
        failed = true;
      }
    } catch {
      console.error("FAIL: could not parse eslint output for violation fixture:", String(e));
      failed = true;
    }
  } else {
    console.error("FAIL: eslint run for violation fixture failed:", String(e));
    failed = true;
  }
}

// 2. Allowed adapter-zone source must lint clean (rule honors allowPaths).
try {
  const res = eslintJson(["apps/gateway/src/adapters/index.ts"]);
  const count = violationsIn(res);
  if (count === 0) {
    console.log("PASS: apps/gateway/src/adapters/index.ts (allowed location) reports no violations");
  } else {
    console.error(`FAIL: allowed adapter zone reported ${String(count)} violations (over-tight rule?)`);
    failed = true;
  }
} catch (e) {
  console.error("FAIL: eslint unexpectedly errored on allowed fixture:", String(e));
  failed = true;
}

if (failed) {
  console.error("verify-forbidden-imports: FAILED");
  process.exit(1);
}
console.log("verify-forbidden-imports: OK (gate fires on violations, passes allowed zones)");
