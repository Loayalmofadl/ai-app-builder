/**
 * Structured logging conventions (ARCHITECTURE.md §15, SECURITY.md §3 redaction).
 * Every service creates a logger via createLogger(serviceName) — JSON output,
 * bound context (service, requestId/correlationId), and secret redaction.
 */
import { randomUUID } from "node:crypto";
import pino, { LoggerOptions, Logger } from "pino";

export interface LogContext {
  traceId?: string;
  tenantId?: string;
  projectId?: string;
  runId?: string;
  jobId?: string;
  correlationId?: string;
}

/** Field names whose values must never appear in serialized logs. */
export const REDACTED_PATHS = [
  "password",
  "authorization",
  "cookie",
  "set-cookie",
  "apiKey",
  "api_key",
  "OPENAI_API_KEY",
  "ANTHROPIC_API_KEY",
  "QWEN_API_KEY",
  "SERVICE_TOKEN_SECRET",
  "AUTH_SESSION_SECRET",
  "PREVIEW_SIGNING_SECRET",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "DATABASE_URL",
  "REDIS_URL",
] as const;

export function buildLoggerOptions(service: string, level: string): LoggerOptions {
  return {
    level,
    base: { service },
    redact: { paths: [...REDACTED_PATHS], censor: "[redacted]" },
    timestamp: pino.stdTimeFunctions.isoTime,
    formatters: {
      level: (label) => ({ level: label }),
    },
  };
}

export function createLogger(service: string, level = "info"): Logger {
  return pino(buildLoggerOptions(service, level));
}

/** Child logger with request/job context bound (correlation per ARCHITECTURE §15). */
export function withContext(logger: Logger, ctx: LogContext): Logger {
  const clean: Record<string, string> = {};
  for (const [k, v] of Object.entries(ctx)) {
    if (typeof v === "string" && v.length > 0) clean[k] = v;
  }
  return logger.child(clean);
}

export function newTraceId(): string {
  return randomUUID();
}
