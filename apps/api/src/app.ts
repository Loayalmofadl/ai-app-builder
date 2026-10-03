/**
 * API app factory (ARCHITECTURE.md §3, ADR-014). Express 4 for the M1 walking
 * skeleton — NestJS adoption is a recorded decision, not drift. No provider
 * SDK imports here: AI access goes through the gateway HTTP boundary using
 * @forge/ai-contracts (ADR-002).
 */
import express, { Express } from "express";
import type { Logger } from "pino";
import { runChecks, summarize, newTraceId, DomainError } from "@forge/shared";
import type { DbHandle } from "@forge/db";
import type { HeartbeatQueueHandle } from "@forge/queue";

export interface ApiAppDeps {
  logger: Logger;
  db: DbHandle;
  gatewayBaseUrl: string;
  /** Optional in tests; when absent the job endpoint reports 503 (fail-closed). */
  heartbeat?: HeartbeatQueueHandle;
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
      if (!deps.heartbeat) {
        throw new DomainError("queue not configured", "QUEUE_UNCONFIGURED", 503);
      }
      const { enqueueHeartbeat } = await import("@forge/queue");
      const jobId = await enqueueHeartbeat(deps.heartbeat.queue, req.body);
      const traceId = (req as express.Request & { traceId?: string }).traceId;
      deps.logger.info({ jobId, traceId }, "heartbeat enqueued");
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
      // zod validation failures are client errors, not server faults.
      if (err.name === "ZodError") {
        res
          .status(400)
          .json({ error: { code: "VALIDATION_ERROR", message: "invalid request payload" } });
        return;
      }
      deps.logger.error({ err }, "unhandled error");
      res.status(500).json({ error: { code: "INTERNAL", message: "internal server error" } });
    },
  );

  return app;
}
