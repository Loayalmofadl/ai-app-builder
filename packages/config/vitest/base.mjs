/**
 * Shared Vitest base config. Packages extend this via their own vitest.config.ts.
 */
import { defineConfig } from "vitest/config";

export function forgeVitestConfig(overrides = {}) {
  return defineConfig({
    test: {
      environment: "node",
      include: ["src/**/*.test.ts", "test/**/*.test.ts"],
      restoreMocks: true,
      ...overrides.test,
    },
    ...overrides,
  });
}
