/**
 * Deterministic web health/readiness endpoint (M1 scope item 10).
 * - GET /api/health -> 200 ok when web itself is serving AND the api upstream
 *   answers live; 503 degraded otherwise. Never leaks URLs/secrets.
 */
import { NextResponse } from "next/server";
import { checkApiLive } from "../../../lib/api-client";

export const dynamic = "force-dynamic";

export async function GET() {
  const started = Date.now();
  let apiOk = false;
  try {
    const live = await checkApiLive();
    apiOk = live.service === "api";
  } catch {
    apiOk = false;
  }
  const body = {
    status: apiOk ? ("ok" as const) : ("degraded" as const),
    service: "web",
    dependencies: [
      { name: "api", ok: apiOk, latencyMs: Date.now() - started },
    ],
    timestamp: new Date().toISOString(),
  };
  return NextResponse.json(body, { status: apiOk ? 200 : 503 });
}
