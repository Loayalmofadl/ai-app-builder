/**
 * Queue definitions (ARCHITECTURE.md §12). One place declares every BullMQ
 * queue: name, payload schema, retry policy. Producers validate payloads with
 * zod BEFORE enqueueing; consumers re-validate (never trust stored data).
 */
import { Queue } from "bullmq";
import IORedis, { RedisOptions } from "ioredis";
import { z } from "zod";

export const QUEUE_NAMES = {
  heartbeat: "forge.heartbeat",
} as const;

/** Minimal M1 example job: safe, idempotent, observable. No product workflows. */
export const HeartbeatJobPayload = z.object({
  /** Idempotency key — processors must dedupe on this. */
  token: z.string().min(8).max(128),
  emittedAt: z.string().datetime(),
  correlationId: z.string().optional(),
});
export type HeartbeatJobPayload = z.infer<typeof HeartbeatJobPayload>;

/** Parse a redis URL into ioredis options (URL is the only config surface). */
export function redisOptionsFromUrl(url: string): RedisOptions {
  const parsed = new URL(url);
  if (parsed.protocol !== "redis:" && parsed.protocol !== "rediss:") {
    throw new Error("REDIS_URL must use redis:// or rediss://");
  }
  return {
    host: parsed.hostname,
    port: Number(parsed.port || (parsed.protocol === "rediss:" ? 6394 : 6379)),
    username: parsed.username || undefined,
    password: parsed.password ? decodeURIComponent(parsed.password) : undefined,
    db: parsed.pathname && parsed.pathname !== "/" ? Number(parsed.pathname.slice(1)) : 0,
    maxRetriesPerRequest: null, // required by BullMQ blocking commands
    enableReadyCheck: true,
    // rediss:// keeps TLS verification ON by default; we never set rejectUnauthorized:false
    ...(parsed.protocol === "rediss:" ? { tls: {} } : {}),
  };
}

export function createRedisConnection(url: string): IORedis {
  // keyPrefix would break BullMQ's internal keys; queues live in their own namespace.
  return new IORedis(redisOptionsFromUrl(url));
}

export interface HeartbeatQueueHandle {
  queue: Queue<HeartbeatJobPayload>;
  close(): Promise<void>;
}

export function createHeartbeatQueue(connection: IORedis): HeartbeatQueueHandle {
  const queue = new Queue<HeartbeatJobPayload>(QUEUE_NAMES.heartbeat, {
    connection,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: "exponential", delay: 1000 },
      removeOnComplete: { age: 3600, count: 1000 },
      removeOnFail: { age: 86_400 },
    },
  });
  return {
    queue,
    async close() {
      await queue.close();
    },
  };
}

/** Producer-side validation gate: refuses to enqueue malformed payloads. */
export async function enqueueHeartbeat(
  queue: Queue<HeartbeatJobPayload>,
  payload: unknown,
): Promise<string> {
  const valid = HeartbeatJobPayload.parse(payload);
  const job = await queue.add("heartbeat", valid, {
    jobId: `hb-${valid.token}`, // deterministic id => re-enqueue is a no-op (idempotent)
  });
  return String(job.id);
}
