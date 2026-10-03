/**
 * Worker bootstrap (ARCHITECTURE.md §3, §12): BullMQ consumer host. M1 owns a
 * single safe example queue (heartbeat). Jobs are idempotent by deterministic
 * jobId and observable via structured logs with correlation ids.
 */
import { Worker } from "bullmq";
import { loadEnv, createLogger, withContext, newTraceId } from "@forge/shared";
import {
  QUEUE_NAMES,
  HeartbeatJobPayload,
  createRedisConnection,
} from "@forge/queue";

const env = loadEnv("worker");
const logger = createLogger("worker", env.LOG_LEVEL);
const connection = createRedisConnection(env.REDIS_URL);

let processedCount = 0;

const worker = new Worker<HeartbeatJobPayload>(
  QUEUE_NAMES.heartbeat,
  async (job) => {
    // Consumers re-validate stored data — never trust the queue (SECURITY §6).
    const payload = HeartbeatJobPayload.parse(job.data);
    const log = withContext(logger, {
      jobId: job.id,
      correlationId: payload.correlationId ?? job.id ?? newTraceId(),
    });
    // Idempotency note: BullMQ dedupes enqueue by jobId (`hb-<token>`), so a
    // duplicate token never creates a second job. Processing is side-effect
    // free in M1 (log only), which makes retries trivially safe.
    processedCount += 1;
    log.info({ emittedAt: payload.emittedAt, attempt: job.attemptsMade + 1 }, "heartbeat processed");
    return { ok: true, processedAt: new Date().toISOString() };
  },
  { connection, concurrency: 5 },
);

worker.on("failed", (job, err) => {
  logger.error({ jobId: job?.id, err: err.message }, "job failed");
});
worker.on("ready", () => logger.info({ queue: QUEUE_NAMES.heartbeat }, "worker consuming"));
worker.on("error", (err) => logger.error({ err }, "worker error"));

// Liveness surface for dev stack monitoring (no HTTP server exposure beyond
// loopback status file — workers are probed via Redis in M1).
process.on("SIGTERM", async () => {
  logger.warn({ signal: "SIGTERM", processedCount }, "worker draining");
  await worker.close();
  connection.disconnect();
  process.exit(0);
});
process.on("SIGINT", () => process.kill(process.pid, "SIGTERM"));
