/**
 * Shared ESLint base config (flat format) for all Forge apps/packages.
 * Policy lives here — per-package configs only extend it. (DEVELOPMENT.md §6)
 */
import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/.next/**",
      "**/node_modules/**",
      "**/coverage/**",
      "**/.turbo/**",
      "**/*.d.ts",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
    },
    rules: {
      // CONTRIBUTING.md §1.2 — `any` requires justified disable comment.
      "@typescript-eslint/no-explicit-any": "error",
      // QWEN.md §3 / DEVELOPMENT.md §5 — no swallowed errors.
      "no-empty": ["error", { allowEmptyCatch: false }],
      "no-console": "error",
      "@typescript-eslint/consistent-type-imports": "off",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  {
    // Config/tooling files run in CJS or are scripts; relax console there.
    files: ["**/*.cjs", "**/*.mjs", "scripts/**/*.ts", "packages/config/eslint/**"],
    rules: {
      "no-console": "off",
    },
  },
  {
    files: ["**/*.test.ts", "**/*.spec.ts", "fixtures/**"],
    rules: {
      "no-console": "off",
    },
  },
);
