import { describe, it, expect } from "vitest";
import {
  NormalizedChatRequest,
  NormalizedChunk,
  ProviderErrorPayload,
  isRetryable,
} from "./index.js";

const baseReq = {
  modelRole: "fast-cheap",
  messages: [{ role: "user", content: [{ type: "text", text: "hi" }] }],
  requestId: "3f0c8a5e-2b1d-4e6f-9a8b-7c6d5e4f3a2b",
};

describe("NormalizedChatRequest contract", () => {
  it("accepts a minimal valid request and applies stream default", () => {
    const parsed = NormalizedChatRequest.parse(baseReq);
    expect(parsed.stream).toBe(false);
    expect(parsed.modelRole).toBe("fast-cheap");
  });

  it("rejects unknown model roles (callers cannot name vendors)", () => {
    expect(() =>
      NormalizedChatRequest.parse({ ...baseReq, modelRole: "gpt-4o-turbo-max" }),
    ).toThrow();
  });

  it("rejects empty message lists and malformed tool calls", () => {
    expect(() => NormalizedChatRequest.parse({ ...baseReq, messages: [] })).toThrow();
    expect(() =>
      NormalizedChatRequest.parse({
        ...baseReq,
        messages: [{ role: "assistant", content: [{ type: "tool_call", id: "", name: "x", arguments: {} }] }],
      }),
    ).toThrow();
  });

  it("rejects out-of-range temperature (boundary validation, TESTING.md §4.3)", () => {
    expect(() => NormalizedChatRequest.parse({ ...baseReq, temperature: 5 })).toThrow();
  });
});

describe("Streaming chunk contract", () => {
  it("accepts text delta and done chunks", () => {
    expect(NormalizedChunk.parse({ kind: "text_delta", text: "Hel" }).kind).toBe("text_delta");
    expect(
      NormalizedChunk.parse({
        kind: "done",
        finishReason: "stop",
        usage: { inputTokens: 5, outputTokens: 12 },
      }).finishReason,
    ).toBe("stop");
  });

  it("rejects unknown kinds", () => {
    expect(() => NormalizedChunk.parse({ kind: "mystery" })).toThrow();
  });
});

describe("Provider error classification", () => {
  it("validates error payloads and rejects raw-body overflow", () => {
    const ok = ProviderErrorPayload.parse({
      errorClass: "rate_limited",
      provider: "example",
      message: "slow down",
      retryAfterSeconds: 2,
    });
    expect(ok.errorClass).toBe("rate_limited");
  });

  it("retry policy matches ARCHITECTURE §6 (only transient classes)", () => {
    expect(isRetryable("rate_limited")).toBe(true);
    expect(isRetryable("overloaded")).toBe(true);
    expect(isRetryable("timeout")).toBe(true);
    expect(isRetryable("invalid_request")).toBe(false);
    expect(isRetryable("authentication")).toBe(false);
    expect(isRetryable("quota_exceeded")).toBe(false);
  });
});
