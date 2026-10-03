import { defineConfig } from "vitest/config";
/** Integration tier (TESTING.md §3): real Redis required; gated by REDIS_URL. */
export default defineConfig({
  test: { environment: "node", include: ["src/**/*.integration.test.ts"], testTimeout: 30000, hookTimeout: 30000 },
});
