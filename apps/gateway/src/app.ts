/**
 * Gateway app factory (ARCHITECTURE.md §6, ADR-002): owns the AI provider
 * boundary. M1 scope = process/module boundary + health only; adapters and
 * routing land in M3. Exported as a factory so tests can run the REAL app
 * in-process; main.ts wires env and listens.
 */
import express, { Express } from "express";
import type { Logger } from "pino";
import { loadEnv, createLogger, runChecks, summarize, newTraceId } from "@forge/shared";
import { NormalizedChatRequest } from "@forge/ai-contracts";
import { redisOptionsFromUrl } from "@forge/queue";

export interface GatewayAppDeps {
  logger: Logger;
  redisUrl: string;
}

const VERSION = process.env.npm_package_version ?? "0.0.0";

export function createGatewayApp(deps: GatewayAppDeps): Express {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "1mb" }));

  // Correlation id propagation (ARCHITECTURE §15)
  app.use((req, res, next) => {
    const traceId = (req.headers["x-trace-id"] as string) || newTraceId();
    res.setHeader("x-trace-id", traceId);
    next();
  });

  app.get("/health/live", (_req, res) => {
    res.json({ status: "ok", service: "gateway", timestamp: new Date().toISOString() });
  });

  app.get("/health/ready", async (_req, res) => {
    // Redis is the metering/event buffer dependency (M3 wires usage events).
    // Connectivity probe without exposing connection details (SECURITY.md §3).
    const checks = await runChecks([
      {
        name: "redis",
        timeoutMs: 2500,
        fn: async () => {
          const IORedis = (await import("ioredis")).default;
          const c = new IORedis({
            ...redisOptionsFromUrl(deps.redisUrl),
            retryStrategy: () => null,
            lazyConnect: true,
            maxRetriesPerRequest: 1,
          });
          try {
            return (await c.ping()) === "PONG";
          } finally {
            c.disconnect();
          }
        },
      },
    ]);
    const body = summarize("gateway", VERSION, checks);
    res.status(body.status === "ok" ? 200 : 503).json(body);
  });

  // M1 boundary placeholder: proves the gateway hosts the normalized /v1/chat
  // surface that api will call from M3 onward. Request validation uses the
  // provider-neutral contract; NO provider SDK import exists anywhere outside
  // apps/gateway/src/adapters/** (enforced by forge/forbidden-provider-imports).
  app.post("/v1/chat/completions", (req, res) => {
    const parsed = NormalizedChatRequest.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: { code: "VALIDATION_ERROR", message: "invalid normalized chat request" } });
      return;
    }
    res.status(501).json({
      error: { code: "NOT_IMPLEMENTED", message: "AI gateway completes land in M3" },
    });
  });

  return app;
}

/** Bootstrap entry (used by main.ts): fail-fast env BEFORE any listener. */
export function startGateway() {
  const env = loadEnv("gateway");
  const logger = createLogger("gateway", env.LOG_LEVEL);
  const app = createGatewayApp({ logger, redisUrl: env.REDIS_URL });
  const server = app.listen(env.GATEWAY_PORT, "127.0.0.1", () => {
    logger.info({ port: env.GATEWAY_PORT }, "gateway listening on loopback (dev only)");
  });

  function shutdown(signal: string) {
    logger.warn({ signal }, "shutting down");
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 5000).unref();
  }
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}
