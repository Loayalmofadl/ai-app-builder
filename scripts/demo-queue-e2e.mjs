#!/usr/bin/env node
/**
 * demo-queue-e2e.mjs — REAL end-to-end proof of the queue path (M1 exit
 * criterion: "queue E2E passes"). Flow:
 *
 *   producer enqueues heartbeat job → BullMQ/Redis → worker consumes →
 *   job reaches completed state with a returnvalue stored in Redis.
 *
 * Fails (exit 1) if the worker does not actually process the job within the
 * timeout. Requires REDIS_URL (real Redis; no mocks). Run via `pnpm demo:queue-e2e`.
 */
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const root = path.resolve(import.meta.dirname, "..");
// Load built workspace packages (build must run before this script in CI/dev).
const queueMod = require(path.join(root, "packages/queue/dist/index.js"));
const { Worker } = require("bullmq");

const redisUrl = process.env.REDIS_URL;
if (!redisUrl) {
  console.error("demo-queue-e2e: REDIS_URL is required (this is an integration check, not a mock)");
  process.exit(1);
}

const { QUEUE_NAMES, createHeartbeatQueue, createRedisConnection, enqueueHeartbeat } = queueMod;

const token = `e2e-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const producerConn = createRedisConnection(redisUrl);
const consumerConn = createRedisConnection(redisUrl);
const handle = createHeartbeatQueue(producerConn);

let processedToken = null;
const worker = new Worker(
  QUEUE_NAMES.heartbeat,
  async (job) => {
    const payload = queueMod.HeartbeatJobPayload.parse(job.data);
    processedToken = payload.token;
    return { ok: true, processedAt: new Date().toISOString() };
  },
  { connection: consumerConn, concurrency: 1 },
);
worker.on("failed", (job, err) => {
  console.error(`demo-queue-e2e: job ${String(job?.id ?? "?")} failed: ${err.message}`);
});

let exitCode = 0;
try {
  const jobId = await enqueueHeartbeat(handle.queue, {
    token,
    emittedAt: new Date().toISOString(),
    correlationId: "demo-e2e",
  });
  console.log(`enqueued job ${jobId}; waiting for worker to complete it...`);

  const deadline = Date.now() + 15000;
  while (Date.now() < deadline && processedToken !== token) {
    await new Promise((r) => setTimeout(r, 250));
  }

  if (processedToken !== token) {
    console.error("demo-queue-e2e: FAILED - worker never processed the job (timeout)");
    process.exit(1);
  }

  // Confirm terminal state in Redis itself (not just the local callback):
  const stored = await handle.queue.getJob(jobId);
  const state = stored ? await stored.getState() : "missing";
  const retval = stored ? stored.returnvalue : null;
  if (state !== "completed" || !retval) {
    console.error(`demo-queue-e2e: FAILED - job state "${state}" is not completed-with-returnvalue`);
    process.exit(1);
  }
  console.log(`demo-queue-e2e: OK - job ${jobId} completed in Redis: ${JSON.stringify(retval)}`);
} catch (e) {
  console.error("demo-queue-e2e: FAILED -", String(e));
  exitCode = 1;
} finally {
  await worker.close();
  await handle.close();
  producerConn.disconnect();
  consumerConn.disconnect();
  process.exit(exitCode);
}
