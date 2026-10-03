/**
 * Shared health/readiness contracts used by api/gateway/web (M1 scope item 10).
 * Health responses NEVER include connection strings or secrets — status +
 * dependency booleans only (SECURITY.md §3).
 */
import { z } from "zod";

export const DependencyStatus = z.object({
  name: z.string(),
  ok: z.boolean(),
  latencyMs: z.number().nonnegative().optional(),
});
export type DependencyStatus = z.infer<typeof DependencyStatus>;

export const HealthResponse = z.object({
  status: z.enum(["ok", "degraded", "unhealthy"]),
  service: z.string(),
  version: z.string(),
  uptimeSeconds: z.number(),
  dependencies: z.array(DependencyStatus),
  timestamp: z.string(),
});
export type HealthResponse = z.infer<typeof HealthResponse>;

export interface CheckResult {
  name: string;
  ok: boolean;
  latencyMs?: number;
}

/** Run checks concurrently with a timeout each; never throws. */
export async function runChecks(
  checks: Array<{ name: string; fn: () => Promise<boolean>; timeoutMs?: number }>,
): Promise<CheckResult[]> {
  return Promise.all(
    checks.map(async ({ name, fn, timeoutMs = 2000 }) => {
      const start = Date.now();
      try {
        const ok = await Promise.race([
          fn(),
          new Promise<boolean>((resolve) => setTimeout(() => resolve(false), timeoutMs)),
        ]);
        return { name, ok, latencyMs: Date.now() - start };
      } catch {
        return { name, ok: false, latencyMs: Date.now() - start };
      }
    }),
  );
}

export function summarize(service: string, version: string, deps: CheckResult[]): z.infer<typeof HealthResponse> {
  const allOk = deps.every((d) => d.ok);
  return {
    status: allOk ? "ok" : "degraded",
    service,
    version,
    uptimeSeconds: Math.round(process.uptime()),
    dependencies: deps,
    timestamp: new Date().toISOString(),
  };
}
