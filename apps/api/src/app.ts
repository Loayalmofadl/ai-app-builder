/**
 * API app factory (ARCHITECTURE.md §3). Express for the M1 walking skeleton;
 * NestJS migration is an M2 decision point. No provider SDK imports here —
 * AI access goes through the gateway HTTP boundary using @forge/ai-contracts.
 */
import express, { Express } from "express";
import { Logger } from "pino";
import { runChecks, summarize, newTraceId, DomainError } from "@forge/shared";
import { DbHandle } from "@forge/db";

export interface ApiAppDeps {
  logger: Logger;
  db: DbHandle;
  gatewayBaseUrl: string;
}

const VERSION = process.env.npm_package_version ?? "0.0.0";

export function createApiApp(deps: ApiAppDeps): Express {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "256kb" }));

  // Correlation id propagation (ARCHITECTURE §15)
  app.use((req, res, next) => {
    const traceId = (req.headers["x-trace-id"] as string) || newTraceId();
    (req as express.Request & { traceId?: string }).traceId = traceId;
    res.setHeader("x-trace-id", traceId);
    next();
  });

  app.get("/health/live", (_req, res) => {
    res.json({ status: "ok", service: "api", timestamp: new Date().toISOString() });
  });

  app.get("/health/ready", async (_req, res) => {
    const checks = await runChecks([
      { name: "postgres", fn: async () => (await deps.db.ping()) >= 0 },
      {
        name: "gateway",
        fn: async () => {
          const r = await fetch(`${deps.gatewayBaseUrl}/health/live`, {
            signal: AbortSignal.timeout(2000),
          });
          return r.ok;
        },
      },
    ]);
    const body = summarize("api", VERSION, checks);
    res.status(body.status === "ok" ? 200 : 503).json(body);
  });

  // Walking-skeleton orchestration endpoint: proves api -> queue path exists.
  app.post("/v1/jobs/heartbeat", async (req, res, next) => {
    try {
      const { HeartbeatJobPayload } = await import("@forge/queue");
      const payload = HeartbeatJobPayload.parse(req.body);
      const { enqueueHeartbeat, createRedisConnection, createHeartbeatQueue } = await import(
        "@forge/queue"
      );
      const redisUrl = process.env.REDIS_URL;
      if (!redisUrl) throw new DomainError("queue not configured", "QUEUE_UNCONFIGURED", 503);
      const conn = createRedisConnection(redisUrl);
      const handle = createHeartbeatQueue(conn);
      const jobId = await enqueueHeartbeat(handle.queue, payload);
      await handle.close();
      conn.disconnect();
      deps.logger.info({ jobId, traceId: req.traceId }, "heartbeat enqueued");
      res.status(202).json({ jobId });
    } catch (e) {
      next(e);
    }
  });

  // Central error mapping (no stack traces or internals to clients).
  app.use(
    (
      err: Error,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      if (err instanceof DomainError) {
        res.status(err.statusCode).json(err.toPublicShape());
        return;
      }
      deps.logger.error({ err }, "unhandled error");
      res.status(500).json({ error: { code: "INTERNAL", message: "internal server error" } });
    },
  );

  return app;
}
