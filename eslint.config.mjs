/**
 * Root ESLint config (flat). Per-package configs live in each app/package;
 * this root config exists so `eslint .` has a deterministic base when run
 * from the repo root, and to ignore non-source trees.
 */
export default [
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/.next/**",
      "**/coverage/**",
      "**/.turbo/**",
      "**/*.d.ts",
      "apps/**",
      "packages/**",
      "fixtures/**",
      "scripts/**",
    ],
  },
];
