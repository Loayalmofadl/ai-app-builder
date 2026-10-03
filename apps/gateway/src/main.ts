/**
 * Gateway bootstrap (ARCHITECTURE.md §6, ADR-002): owns the AI provider
 * boundary. M1 scope = process/module boundary + health only; adapters and
 * routing land in M3. Listens on loopback in dev — never public.
 */
import express from "express";
import { loadEnv, createLogger, runChecks, summarize, newTraceId } from "@forge/shared";

const env = loadEnv("gateway");
const logger = createLogger("gateway", env.LOG_LEVEL);
const VERSION = process.env.npm_package_version ?? "0.0.0";

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "1mb" }));

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
      fn: async () => {
        const IORedis = (await import("ioredis")).default;
        const { redisOptionsFromUrl } = await import("@forge/queue");
        const c = new IORedis(redisOptionsFromUrl(env.REDIS_URL));
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

// M1 boundary placeholder: proves gateway hosts the /v1/chat surface that api
// will call from M3 onward. No provider SDK import anywhere outside adapters/.
app.post("/v1/chat/completions", (_req, res) => {
  res.status(501).json({
    error: { code: "NOT_IMPLEMENTED", message: "AI gateway completes land in M3" },
  });
});

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
