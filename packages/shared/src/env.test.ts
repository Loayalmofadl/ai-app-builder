import { describe, it, expect } from "vitest";
import { loadEnv, EnvValidationError } from "./env.js";

const validBase = {
  NODE_ENV: "development",
  DATABASE_URL: "postgresql://u:p@localhost:5432/db",
  REDIS_URL: "redis://localhost:6379",
  SERVICE_TOKEN_SECRET: "x".repeat(32),
};

describe("loadEnv (fail-fast configuration)", () => {
  it("accepts a valid api environment and applies defaults", () => {
    const env = loadEnv("api", { ...validBase });
    expect(env.API_PORT).toBe(3001);
    expect(env.LOG_LEVEL).toBe("info");
    expect(env.DATABASE_POOL_MAX).toBe(10);
  });

  it("rejects missing DATABASE_URL for api with precise issue", () => {
    const bad = { ...validBase } as Record<string, string>;
    delete bad.DATABASE_URL;
    expect(() => loadEnv("api", bad)).toThrow(EnvValidationError);
    try {
      loadEnv("api", bad);
    } catch (e) {
      expect((e as EnvValidationError).issues.join()).toContain("DATABASE_URL");
    }
  });

  it("rejects malformed DATABASE_URL scheme", () => {
    expect(() => loadEnv("api", { ...validBase, DATABASE_URL: "mysql://x" })).toThrow(
      EnvValidationError,
    );
  });

  it("rejects short SERVICE_TOKEN_SECRET (weak secret fails boot)", () => {
    expect(() => loadEnv("api", { ...validBase, SERVICE_TOKEN_SECRET: "short" })).toThrow(
      EnvValidationError,
    );
  });

  it("web does not require database/redis at all", () => {
    const env = loadEnv("web", { NODE_ENV: "development" });
    expect(env.WEB_PORT).toBe(3000);
  });

  it("gateway in production refuses to start with zero provider keys (fail-closed)", () => {
    expect(() =>
      loadEnv("gateway", {
        ...validBase,
        NODE_ENV: "production",
        OPENAI_API_KEY: "",
        ANTHROPIC_API_KEY: "",
        QWEN_API_KEY: "",
      }),
    ).toThrow(/at least one provider API key/);
  });

  it("error messages never contain secret values", () => {
    const secretValue = "sup3r-s3cret-value-should-not-leak";
    let message = "";
    try {
      loadEnv("api", { ...validBase, SERVICE_TOKEN_SECRET: secretValue.slice(0, 4) });
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).not.toContain(secretValue);
  });
});
