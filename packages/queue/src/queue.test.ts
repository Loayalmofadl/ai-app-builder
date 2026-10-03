import { describe, it, expect } from "vitest";
import { redisOptionsFromUrl, HeartbeatJobPayload } from "./index.js";

describe("redisOptionsFromUrl", () => {
  it("parses plain redis URLs", () => {
    const opts = redisOptionsFromUrl("redis://localhost:6379/2");
    expect(opts.host).toBe("localhost");
    expect(opts.port).toBe(6379);
    expect(opts.db).toBe(2);
    expect(opts.maxRetriesPerRequest).toBeNull();
  });

  it("parses rediss URLs and keeps TLS enabled (no insecure overrides)", () => {
    const opts = redisOptionsFromUrl("rediss://user:pass@cache.example:6380/0");
    expect(opts.tls).toBeDefined();
    expect(opts.password).toBe("pass");
    expect((opts as Record<string, unknown>)["rejectUnauthorized"]).not.toBe(false);
  });

  it("rejects non-redis schemes", () => {
    expect(() => redisOptionsFromUrl("http://localhost:6379")).toThrow();
  });
});

describe("HeartbeatJobPayload schema", () => {
  it("accepts well-formed payloads", () => {
    const ok = HeartbeatJobPayload.parse({
      token: "abcdef123456",
      emittedAt: new Date().toISOString(),
    });
    expect(ok.token).toBe("abcdef123456");
  });

  it("rejects short tokens and bad timestamps", () => {
    expect(() => HeartbeatJobPayload.parse({ token: "x", emittedAt: "yesterday" })).toThrow();
  });
});
