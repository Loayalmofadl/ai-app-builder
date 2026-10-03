/**
 * Unit tests for the forbidden-provider-imports rule itself (TESTING.md §4 —
 * boundary rules must have accept/reject cases). Run via `pnpm --filter
 * @forge/config test`.
 */
import { describe, it, expect } from "vitest";
import { RuleTester } from "eslint";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const rule = require("./forbidden-provider-imports.cjs");

const tester = new RuleTester({
  languageOptions: { parser: null, ecmaVersion: 2022, sourceType: "module" },
});

describe("forbidden-provider-imports rule", () => {
  it("flags static import outside adapters", () => {
    expect(() =>
      tester.run("rule", rule, {
        valid: [],
        invalid: [
          {
            code: `import OpenAI from "openai";`,
            filename: "/repo/apps/api/src/sneaky.ts",
            options: [{ cwd: "/repo" }],
            errors: [{ messageId: "forbiddenProviderImport" }],
          },
        ],
      }),
    ).not.toThrow();
  });

  it("passes valid cases", () => {
    expect(() =>
      tester.run("rule", rule, {
        valid: [
          {
            code: `import OpenAI from "openai";`,
            filename: "/repo/apps/gateway/src/adapters/openai.adapter.ts",
            options: [{ cwd: "/repo" }],
          },
          {
            code: `import { z } from "zod";`,
            filename: "/repo/apps/api/src/legit.ts",
            options: [{ cwd: "/repo" }],
          },
          {
            code: `import local from "./relative";`,
            filename: "/repo/apps/api/src/rel.ts",
            options: [{ cwd: "/repo" }],
          },
        ],
        invalid: [],
      }),
    ).not.toThrow();
  });

  it("flags require() and dynamic import()", () => {
    expect(() =>
      tester.run("rule", rule, {
        valid: [],
        invalid: [
          {
            code: `const Anthropic = require("@anthropic-ai/sdk");`,
            filename: "/repo/apps/worker/src/bad.js",
            options: [{ cwd: "/repo" }],
            errors: [{ messageId: "forbiddenProviderImport" }],
          },
          {
            code: `await import("groq-sdk");`,
            filename: "/repo/apps/api/src/dyn.ts",
            options: [{ cwd: "/repo" }],
            errors: [{ messageId: "forbiddenProviderImport" }],
          },
        ],
      }),
    ).not.toThrow();
  });
});
