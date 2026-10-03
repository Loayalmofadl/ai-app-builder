import { defineConfig } from "vitest/config";

/** Rule self-tests live in eslint/ (not src/); dedicated config for `pnpm test`. */
export default defineConfig({
  test: { environment: "node", include: ["eslint/**/*.test.ts"] },
});
