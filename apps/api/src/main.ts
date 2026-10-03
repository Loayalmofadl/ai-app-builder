/**
 * API bootstrap: fail-fast env validation BEFORE any listener opens.
 */
import { loadEnv, createLogger } from "@forge/shared";
import { createDb } from "@forge/db";
import { createApiApp } from "./app.js";

const env = loadEnv("api");
const logger = createLogger("api", env.LOG_LEVEL);
const db = createDb(env.DATABASE_URL, env.DATABASE_POOL_MAX, logger);

const app = createApiApp({ logger, db, gatewayBaseUrl: env.GATEWAY_BASE_URL });
const server = app.listen(env.API_PORT, "127.0.0.1", () => {
  logger.info({ port: env.API_PORT }, "api listening on loopback (dev only)");
});

async function shutdown(signal: string) {
  logger.warn({ signal }, "shutting down");
  server.close();
  await db.close();
  process.exit(0);
}
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
