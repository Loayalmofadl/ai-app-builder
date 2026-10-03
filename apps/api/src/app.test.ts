/**
 * API unit tests (TESTING.md §4). These fail meaningfully if the walking
 * skeleton contract breaks: health shape, gateway dependency probing, queue
 * payload validation, error hygiene. No real infra — db/queue are stubs and a
 * local express mock stands in for the gateway.
 */
import { describe, it, expect } from "vitest";
import express from "express";
import request from "supertest";
import { createLogger } from "@forge/shared";
import type { DbHandle } from "@forge/db";
import type { HeartbeatQueueHandle } from "@forge/queue";
import { createApiApp } from "./app.js";

function stubDb(pingOk = true): DbHandle {
  return {
    db: {} as DbHandle["db"],
    ping: async () => (pingOk ? 1 : Promise.reject(new Error("refused"))),
    close: async () => {},
  };
}

function stubGateway(handler?: (req: express.Request, res: express.Response) => void) {
  const app = express();
  app.get("/health/live", handler ?? ((_req, res) => res.json({ status: "ok", service: "gateway" })));
  return app;
}

async function withGateway(
  handler?: (req: express.Request, res: express.Response) => void,
): Promise<{ url: string; close: () => void }> {
  const gw = stubGateway(handler);
  const server = gw.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  const addr = server.address();
  if (addr === null || typeof addr === "string") throw new Error("no addr");
  return { url: `http://127.0.0.1:${String(addr.port)}`, close: () => server.close() };
}

const logger = createLogger("api-test", "silent");

describe("GET /health/live", () => {
  it("returns ok without touching dependencies", async () => {
    const app = createApiApp({ logger, db: stubDb(), gatewayBaseUrl: "http://127.0.0.1:1" });
    const res = await request(app).get("/health/live");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
    expect(res.body.service).toBe("api");
    expect(JSON.stringify(res.body)).not.toMatch(/password|postgresql:\/\//i);
  });
});

describe("GET /health/ready", () => {
  it("is 200 when postgres and gateway are both reachable", async () => {
    const gw = await withGateway();
    const app = createApiApp({ logger, db: stubDb(true), gatewayBaseUrl: gw.url });
    const res = await request(app).get("/health/ready");
    gw.close();
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
    expect(res.body.dependencies.find((d: { name: string }) => d.name === "postgres").ok).toBe(true);
    expect(res.body.dependencies.find((d: { name: string }) => d.name === "gateway").ok).toBe(true);
  });

  it("is 503 when the gateway is down (proves the chain, not a static echo)", async () => {
    const app = createApiApp({ logger, db: stubDb(true), gatewayBaseUrl: "http://127.0.0.1:1" });
    const res = await request(app).get("/health/ready");
    expect(res.status).toBe(503);
    const dep = res.body.dependencies.find((d: { name: string }) => d.name === "gateway");
    expect(dep.ok).toBe(false);
  });

  it("is 503 when postgres is down", async () => {
    const gw = await withGateway();
    const app = createApiApp({ logger, db: stubDb(false), gatewayBaseUrl: gw.url });
    const res = await request(app).get("/health/ready");
    gw.close();
    expect(res.status).toBe(503);
    expect(res.body.dependencies.find((d: { name: string }) => d.name === "postgres").ok).toBe(false);
  });
});

describe("POST /v1/jobs/heartbeat", () => {
  it("validates payload at the boundary — malformed jobs are rejected (400)", async () => {
    const gw = await withGateway();
    const redisStub = {} as never;
    // Real enqueueHeartbeat path via @forge/queue would need Redis; here we
    // assert the HTTP layer surfaces zod failures as 400 VALIDATION_ERROR.
    const { enqueueHeartbeat } = await import("@forge/queue");
    void redisStub;
    void enqueueHeartbeat;
    const failingHandle = {
      queue: {
        add: async () => {
          throw new Error("must not be reached for invalid payload");
        },
      },
      close: async () => {},
    } as unknown as HeartbeatQueueHandle;
    const app = createApiApp({
      logger,
      db: stubDb(),
      gatewayBaseUrl: gw.url,
      heartbeat: failingHandle,
    });
    const res = await request(app).post("/v1/jobs/heartbeat").send({ token: "short" });
    gw.close();
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("accepts a valid payload and returns 202 with a jobId", async () => {
    const gw = await withGateway();
    let addedWithId: string | null = null;
    const handle = {
      queue: {
        add: async (_name: string, _data: unknown, opts: { jobId: string }) => {
          addedWithId = opts.jobId;
          return { id: opts.jobId };
        },
      },
      close: async () => {},
    } as unknown as HeartbeatQueueHandle;
    const app = createApiApp({ logger, db: stubDb(), gatewayBaseUrl: gw.url, heartbeat: handle });
    const res = await request(app)
      .post("/v1/jobs/heartbeat")
      .send({ token: "abcdef12345", emittedAt: new Date().toISOString(), correlationId: "c-1" });
    gw.close();
    expect(res.status).toBe(202);
    expect(res.body.jobId).toBe("hb-abcdef12345");
    expect(addedWithId).toBe("hb-abcdef12345"); // deterministic id => idempotent enqueue
  });

  it("fails closed with 503 when no queue is configured", async () => {
    const gw = await withGateway();
    const app = createApiApp({ logger, db: stubDb(), gatewayBaseUrl: gw.url });
    const res = await request(app)
      .post("/v1/jobs/heartbeat")
      .send({ token: "abcdef12345", emittedAt: new Date().toISOString() });
    gw.close();
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe("QUEUE_UNCONFIGURED");
  });
});

describe("error hygiene", () => {
  it("never leaks stack traces or internals on unexpected errors", async () => {
    const gw = await withGateway();
    const boomHandle = {
      queue: {
        add: async () => {
          throw new Error("redis connection secret-host:6379 leaked-secret");
        },
      },
      close: async () => {},
    } as unknown as HeartbeatQueueHandle;
    const app = createApiApp({ logger, db: stubDb(), gatewayBaseUrl: gw.url, heartbeat: boomHandle });
    const res = await request(app)
      .post("/v1/jobs/heartbeat")
      .send({ token: "abcdef12345", emittedAt: new Date().toISOString() });
    gw.close();
    expect(res.status).toBe(500);
    expect(JSON.stringify(res.body)).not.toMatch(/leaked-secret|stack|redis/i);
  });

  it("propagates x-trace-id for correlation (ARCHITECTURE §15)", async () => {
    const app = createApiApp({ logger, db: stubDb(), gatewayBaseUrl: "http://127.0.0.1:1" });
    const res = await request(app)
      .get("/health/live")
      .set("x-trace-id", "trace-abc");
    expect(res.headers["x-trace-id"]).toBe("trace-abc");
  });
});
