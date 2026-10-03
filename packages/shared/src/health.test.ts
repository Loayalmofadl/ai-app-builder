import { describe, it, expect } from "vitest";
import { runChecks, summarize } from "./health.js";

describe("runChecks", () => {
  it("marks failing checks as not ok without throwing", async () => {
    const results = await runChecks([
      { name: "good", fn: async () => true },
      { name: "bad", fn: async () => false },
    ]);
    expect(results.find((r) => r.name === "good")?.ok).toBe(true);
    expect(results.find((r) => r.name === "bad")?.ok).toBe(false);
  });

  it("converts thrown dependencies into failed checks (never crashes health)", async () => {
    const results = await runChecks([
      {
        name: "boom",
        fn: async () => {
          throw new Error("connection refused");
        },
      },
    ]);
    expect(results[0]?.ok).toBe(false);
  });

  it("times out slow checks", async () => {
    const results = await runChecks([
      { name: "slow", fn: () => new Promise<boolean>((r) => setTimeout(() => r(true), 5000)), timeoutMs: 50 },
    ]);
    expect(results[0]?.ok).toBe(false);
  });
});

describe("summarize", () => {
  it("reports ok only when every dependency is ok", () => {
    expect(summarize("svc", "1.0.0", [{ name: "a", ok: true }]).status).toBe("ok");
    expect(
      summarize("svc", "1.0.0", [
        { name: "a", ok: true },
        { name: "b", ok: false },
      ]).status,
    ).toBe("degraded");
  });

  it("never includes connection strings or secrets in the payload", () => {
    const body = summarize("svc", "1.0.0", [{ name: "postgres", ok: true, latencyMs: 3 }]);
    const json = JSON.stringify(body);
    expect(json).not.toMatch(/password|postgresql:\/\//i);
    expect(body.service).toBe("svc");
  });
});
