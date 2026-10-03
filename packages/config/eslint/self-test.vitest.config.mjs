import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["eslint/rule-self.test.ts"],
    environment: "node",
  },
});
