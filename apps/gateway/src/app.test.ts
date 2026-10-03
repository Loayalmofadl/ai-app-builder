/**
 * Gateway boundary tests (M1 scope items 8/10). The app factory is exercised
 * with a REAL in-process express app — these fail if the health contract or
 * the not-implemented provider guard change shape. Redis probing is verified
 * against a locally-started fake only when REDIS_URL is absent it must report
 * degraded (fail-closed readiness).
 */
import { describe, it, expect } from "vitest";
import request from "supertest";
import { createLogger } from "@forge/shared";
import { createGatewayApp } from "./app.js";

const logger = createLogger("gateway-test", "silent");

describe("GET /health/live", () => {
  it("returns ok without touching dependencies or secrets", async () => {
    const app = createGatewayApp({ logger, redisUrl: "redis://127.0.0.1:1" });
    const res = await request(app).get("/health/live");
    expect(res.status).toBe(200);
    expect(res.body.service).toBe("gateway");
    expect(JSON.stringify(res.body)).not.toMatch(/password|secret|redis:\/\//i);
  });
});

describe("GET /health/ready", () => {
  it("reports redis dependency status truthfully (unreachable => degraded 503)", async () => {
    // Port 1 is reserved; connection always refused => must NOT claim ok.
    const app = createGatewayApp({ logger, redisUrl: "redis://127.0.0.1:1" });
    const res = await request(app).get("/health/ready");
    expect(res.status).toBe(503);
    expect(res.body.dependencies.find((d: { name: string }) => d.name === "redis").ok).toBe(false);
  }, 10000);
});

describe("provider boundary placeholder surface", () => {
  it("POST /v1/chat/completions answers 501 NOT_IMPLEMENTED in M1 (no silent fake success)", async () => {
    const app = createGatewayApp({ logger, redisUrl: "redis://127.0.0.1:1" });
    const res = await request(app)
      .post("/v1/chat/completions")
      .send({ modelRole: "fast-cheap", messages: [] });
    expect(res.status).toBe(501);
    expect(res.body.error.code).toBe("NOT_IMPLEMENTED");
  });

  it("rejects malformed chat requests at the boundary with 400", async () => {
    const app = createGatewayApp({ logger, redisUrl: "redis://127.0.0.1:1" });
    const res = await request(app).post("/v1/chat/completions").send({ nonsense: true });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("propagates x-trace-id for correlation", async () => {
    const app = createGatewayApp({ logger, redisUrl: "redis://127.0.0.1:1" });
    const res = await request(app).get("/health/live").set("x-trace-id", "gw-trace-1");
    expect(res.headers["x-trace-id"]).toBe("gw-trace-1");
  });
});
