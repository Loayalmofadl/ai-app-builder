import { describe, it, expect } from "vitest";
import { Writable } from "node:stream";
import { buildLoggerOptions, REDACTED_PATHS } from "./logger.js";
import pino from "pino";

function memorySink(chunks: string[]): Writable {
  return new Writable({
    write(chunk: Buffer, _enc: BufferEncoding, cb: (e?: Error | null) => void) {
      chunks.push(chunk.toString());
      cb();
    },
  });
}

describe("structured logging + redaction (SECURITY.md §3)", () => {
  it("redacts known secret fields in serialized output", () => {
    const chunks: string[] = [];
    const dest = memorySink(chunks);
    const logger = pino(buildLoggerOptions("api", "info"), dest);
    logger.info({ password: "hunter2", authorization: "Bearer abc", apiKey: "sk-test-12345" }, "evt");
    const out = chunks.join("");
    expect(out).toContain("[redacted]");
    expect(out).not.toContain("hunter2");
    expect(out).not.toContain("sk-test-12345");
  });

  it("includes service name and ISO timestamp on every line", () => {
    const chunks: string[] = [];
    const dest = memorySink(chunks);
    const logger = pino(buildLoggerOptions("gateway", "info"), dest);
    logger.info("hello");
    const parsed = JSON.parse(chunks[0] ?? "{}") as Record<string, unknown>;
    expect(parsed.service).toBe("gateway");
    expect(typeof parsed.time).toBe("string");
    expect(parsed.level).toBeDefined();
  });

  it("REDACTED_PATHS covers provider key env names", () => {
    for (const k of ["OPENAI_API_KEY", "ANTHROPIC_API_KEY", "QWEN_API_KEY", "DATABASE_URL"]) {
      expect(REDACTED_PATHS).toContain(k);
    }
  });
});
