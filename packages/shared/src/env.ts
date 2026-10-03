/**
 * Fail-fast environment validation (SECURITY.md §3, DEVELOPMENT.md §4).
 *
 * Single source of truth for which env vars exist and their shapes. Apps call
 * `loadEnv(service)` at boot; invalid/missing required config throws with a
 * precise message and the process refuses to start. Secrets are NEVER logged —
 * error output contains variable NAMES and constraint text only, never values.
 */
import { z } from "zod";

export const Service = z.enum(["api", "gateway", "worker", "web"]);
export type ServiceName = z.infer<typeof Service>;

/** Base schema shared by every service. */
const baseSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  FORGE_ENV: z.string().min(1).max(64).default("local"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
});

const databaseSchema = z.object({
  DATABASE_URL: z
    .string()
    .min(1, "DATABASE_URL is required")
    .refine(
      (v) => v.startsWith("postgresql://") || v.startsWith("postgres://"),
      "DATABASE_URL must be a postgresql:// URL",
    ),
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),
});

const redisSchema = z.object({
  REDIS_URL: z
    .string()
    .min(1, "REDIS_URL is required")
    .refine(
      (v) => v.startsWith("redis://") || v.startsWith("rediss://"),
      "REDIS_URL must be redis(s)://",
    ),
});

const portsSchema = z.object({
  API_PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  GATEWAY_PORT: z.coerce.number().int().min(1).max(65535).default(3002),
  WEB_PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  API_BASE_URL: z.string().url().default("http://localhost:3001"),
  GATEWAY_BASE_URL: z.string().url().default("http://localhost:3002"),
});

/**
 * Provider keys: gateway-only concern (SECURITY.md §3). In development they may
 * be absent (adapters report themselves unavailable); in production at least
 * one must be set or the gateway refuses to start (fail-closed).
 */
const providerKeysSchema = z.object({
  OPENAI_API_KEY: z.string().optional().default(""),
  ANTHROPIC_API_KEY: z.string().optional().default(""),
  QWEN_API_KEY: z.string().optional().default(""),
});

/**
 * Inter-service auth secret (ADR-008). REQUIRED in production for every
 * service; optional elsewhere so the M1 walking skeleton boots without it.
 */
const serviceTokenSchema = z.object({
  SERVICE_TOKEN_SECRET: z
    .string()
    .min(32, "SERVICE_TOKEN_SECRET must be at least 32 characters (SECURITY.md §3)")
    .optional(),
});

/**
 * Object-level refinement: a present-but-empty value is rejected (catches
 * `SERVICE_TOKEN_SECRET=` from a carelessly copied .env.example); absent is
 * tolerated outside production (assertProductionRules enforces presence there).
 */
const serviceTokenRequiredShape = serviceTokenSchema.refine(
  (data) => data.SERVICE_TOKEN_SECRET === undefined || data.SERVICE_TOKEN_SECRET.length >= 32,
  "SERVICE_TOKEN_SECRET, if set, must be at least 32 characters (SECURITY.md §3)",
);

/** Per-service requirement map — api/worker never need provider keys. */
const schemas = {
  api: baseSchema
    .merge(databaseSchema)
    .merge(redisSchema)
    .merge(portsSchema)
    .merge(serviceTokenRequiredShape),
  gateway: baseSchema
    .merge(redisSchema)
    .merge(portsSchema)
    .merge(providerKeysSchema)
    .merge(serviceTokenRequiredShape),
  worker: baseSchema.merge(databaseSchema).merge(redisSchema).merge(serviceTokenRequiredShape),
  web: baseSchema.merge(portsSchema),
} as const;

export type ApiEnv = z.infer<(typeof schemas)["api"]>;
export type GatewayEnv = z.infer<(typeof schemas)["gateway"]>;
export type WorkerEnv = z.infer<(typeof schemas)["worker"]>;
export type WebEnv = z.infer<(typeof schemas)["web"]>;

export class EnvValidationError extends Error {
  constructor(
    public readonly service: ServiceName,
    public readonly issues: string[],
  ) {
    super(`Invalid environment for service "${service}":\n  - ${issues.join("\n  - ")}`);
    this.name = "EnvValidationError";
  }
}

/**
 * Cross-field rules zod objects can't express cleanly. Receives PARSED data
 * (defaults applied). Throws EnvValidationError on violation.
 */
function assertProductionRules(data: Record<string, unknown>, service: ServiceName): void {
  const problems: string[] = [];
  if (data.NODE_ENV === "production") {
    // Inter-service token is mandatory in production for every backend service.
    if (service !== "web") {
      const token = data.SERVICE_TOKEN_SECRET;
      if (typeof token !== "string" || token.length < 32) {
        problems.push(`${service} in production requires SERVICE_TOKEN_SECRET (>=32 chars)`);
      }
    }
    if (service === "gateway") {
      const hasKey = ["OPENAI_API_KEY", "ANTHROPIC_API_KEY", "QWEN_API_KEY"].some(
        (k) => typeof data[k] === "string" && (data[k] as string).length > 0,
      );
      if (!hasKey) problems.push("gateway in production requires at least one provider API key");
    }
    if (typeof data.FORGE_ENV === "string" && data.FORGE_ENV.startsWith("CHANGE_ME")) {
      problems.push("FORGE_ENV must not be a placeholder value in production");
    }
  }
  if (problems.length > 0) throw new EnvValidationError(service, problems);
}

/**
 * Parse the given environment for a service. On failure, throws with every
 * problem listed (names + constraints only — never secret values).
 */
export function loadEnv<S extends ServiceName>(
  service: S,
  source: NodeJS.ProcessEnv = process.env,
): S extends "api"
  ? ApiEnv
  : S extends "gateway"
    ? GatewayEnv
    : S extends "worker"
      ? WorkerEnv
      : WebEnv {
  const schema = schemas[service];
  const parsed = schema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".") || "<root>"}: ${i.message}`);
    throw new EnvValidationError(service, issues);
  }
  assertProductionRules(parsed.data as Record<string, unknown>, service);
  return parsed.data as ReturnType<typeof loadEnvCast<S>>;
}

// Type-level indirection so no `any` appears in this file (CONTRIBUTING.md §1.2).
declare function loadEnvCast<S extends ServiceName>(s: S): S extends "api"
  ? ApiEnv
  : S extends "gateway"
    ? GatewayEnv
    : S extends "worker"
      ? WorkerEnv
      : WebEnv;
