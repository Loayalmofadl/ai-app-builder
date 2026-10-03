/**
 * Repo-wide boundary gate: forbidden provider SDK imports (ADR-002).
 *
 * Run standalone in CI (`pnpm lint:boundaries`) and as part of `pnpm lint`.
 * Uses a minimal TS-aware parse so it works without full type info and is
 * fast enough to gate every push.
 */
import tsParser from "typescript-eslint/parser";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const forbiddenProviderImports = require(path.join(here, "forbidden-provider-imports.cjs"));

const repoRoot = path.resolve(here, "../../../");

export default [
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/.next/**",
      "**/coverage/**",
      "**/.turbo/**",
      // The rule's own implementation + self-tests legitimately name packages.
      "packages/config/eslint/forbidden-provider-imports.cjs",
      "packages/config/eslint/rule-self.test.ts",
    ],
  },
  {
    files: ["apps/**/*.{ts,tsx}", "packages/**/*.{ts,tsx}", "scripts/**/*.ts", "fixtures/**/*.ts"],
    languageOptions: {
      parser: tsParser,
      ecmaVersion: 2022,
      sourceType: "module",
    },
    plugins: {
      forge: {
        rules: {
          "forbidden-provider-imports": forbiddenProviderImports,
        },
      },
    },
    rules: {
      "forge/forbidden-provider-imports": [
        "error",
        {
          cwd: repoRoot,
          allowPaths: ["apps/gateway/src/adapters/"],
        },
      ],
    },
  },
];
