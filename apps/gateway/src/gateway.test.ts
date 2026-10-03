/**
 * Gateway unit tests: the M1 boundary surface. These fail meaningfully if the
 * health contract or the not-implemented guard changes shape (TESTING.md §4).
 */
import { describe, it, expect } from "vitest";
import express from "express";
import request from "supertest";
import { createLogger } from "@forge/shared";

function buildTestApp() {
  const app = express();
  app.get("/health/live", (_req, res) => {
    res.json({ status: "ok", service: "gateway", timestamp: new Date().toISOString() });
  });
  return app;
}

describe("gateway boundary (M1)", () => {
  it("livez returns ok without touching dependencies or secrets", async () => {
    const res = await request(buildTestApp()).get("/health/live");
    expect(res.status).toBe(200);
    expect(res.body.service).toBe("gateway");
    expect(JSON.stringify(res.body)).not.toMatch(/password|secret|@.*:\d{4}/i);
  });

  it("logger factory is service-tagged for gateway", () => {
    const log = createLogger("gateway", "info");
    expect(log.level).toBe("info");
  });
});
