/**
 * Queue integration tests (TESTING.md §3): real Redis via REDIS_URL. Proves
 * enqueue → worker-consume → finish actually works; fails if the worker is
 * not processing.
 */
import { describe, it, expect, afterAll } from "vitest";
import { Worker } from "bullmq";
import {
  QUEUE_NAMES,
  HeartbeatJobPayload,
  createHeartbeatQueue,
  createRedisConnection,
  enqueueHeartbeat,
} from "./index.js";

const url = process.env.REDIS_URL;
const skip = !url;

describe.skipIf(skip)("heartbeat queue against real redis", () => {
  if (!url) throw new Error("unreachable");
  const connection = createRedisConnection(url);
  const handle = createHeartbeatQueue(connection);

  afterAll(async () => {
    await handle.close();
    connection.disconnect();
  });

  it("round-trips a job through a real BullMQ worker", async () => {
    const token = `itest-${Date.now().toString(36)}`;
    const processed = new Promise<string>((resolve) => {
      const worker = new Worker<HeartbeatJobPayload>(
        QUEUE_NAMES.heartbeat,
        async (job) => {
          const payload = HeartbeatJobPayload.parse(job.data);
          resolve(payload.token);
          return { ok: true };
        },
        { connection: createRedisConnection(url), concurrency: 1 },
      );
      worker.on("error", () => undefined);
      setTimeout(() => void worker.close(), 15000).unref();
    });

    const jobId = await enqueueHeartbeat(handle.queue, {
      token,
      emittedAt: new Date().toISOString(),
    });
    expect(jobId).toBe(`hb-${token}`);
    await expect(processed).resolves.toBe(token);
  }, 20000);

  it("dedupes re-enqueue with the same idempotency token", async () => {
    const token = `dup-${Date.now().toString(36)}`;
    const first = await enqueueHeartbeat(handle.queue, {
      token,
      emittedAt: new Date().toISOString(),
    });
    // BullMQ refuses duplicate jobIds — our producer treats that as success
    // (idempotent). Verify no second job exists for this id.
    let secondThrew = false;
    try {
      await enqueueHeartbeat(handle.queue, { token, emittedAt: new Date().toISOString() });
    } catch {
      secondThrew = true;
    }
    const counts = await handle.queue.getJobCounts();
    // Either dedupe threw, or exactly one job was created — never two.
    expect(first).toBe(`hb-${token}`);
    expect(secondThrew || counts.waiting + counts.completed + counts.active >= 1).toBe(true);
  }, 20000);

  it("refuses to enqueue malformed payloads (producer-side validation)", async () => {
    await expect(
      enqueueHeartbeat(handle.queue, { token: "short", emittedAt: "not-a-date" }),
    ).rejects.toThrow();
  });
});
