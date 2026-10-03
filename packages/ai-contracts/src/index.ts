/**
 * Provider-neutral AI contracts (ARCHITECTURE.md §6). Application layers depend
 * on these types — never vendor SDK types. Deliberately minimal for M1: stable
 * abstraction boundary only; agent framework comes in M4.
 */
import { z } from "zod";

// ---------- Messages & content ----------

export const TextContent = z.object({
  type: z.literal("text"),
  text: z.string(),
});

export const ToolCallContent = z.object({
  type: z.literal("tool_call"),
  id: z.string().min(1),
  name: z.string().min(1),
  /** Validated by the tool's own zod schema at execution time, not here. */
  arguments: z.record(z.unknown()),
});

export const MessageRole = z.enum(["system", "user", "assistant", "tool"]);

export const ChatMessage = z.object({
  role: MessageRole,
  content: z.array(z.union([TextContent, ToolCallContent])).min(1),
  /** For role=tool: the tool call this message answers. */
  toolCallId: z.string().optional(),
});
export type ChatMessage = z.infer<typeof ChatMessage>;

// ---------- Tool definitions ----------

export const ToolDefinition = z.object({
  name: z.string().min(1).max(128),
  description: z.string().min(1),
  parameters: z.record(z.unknown()), // JSON Schema subset
});
export type ToolDefinition = z.infer<typeof ToolDefinition>;

// ---------- Requests ----------

/** Model *roles* per ARCHITECTURE §7 — callers never name vendor models. */
export const ModelRole = z.enum([
  "agent-planner",
  "code-gen-large",
  "fast-cheap",
  "embeddings",
]);
export type ModelRole = z.infer<typeof ModelRole>;

export const NormalizedChatRequest = z.object({
  modelRole: ModelRole,
  messages: z.array(ChatMessage).min(1),
  tools: z.array(ToolDefinition).optional(),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().int().positive().max(200_000).optional(),
  stream: z.boolean().default(false),
  requestId: z.string().uuid(),
  /** Attribution for metering/logging (tenant/user/project/run) — opaque to providers. */
  context: z
    .object({
      tenantId: z.string().optional(),
      userId: z.string().optional(),
      projectId: z.string().optional(),
      runId: z.string().optional(),
    })
    .optional(),
});
export type NormalizedChatRequest = z.infer<typeof NormalizedChatRequest>;

// ---------- Responses ----------

export const FinishReason = z.enum(["stop", "tool_calls", "length", "content_filter", "error"]);

export const Usage = z.object({
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  /** Cache/billing detail adapters may surface; optional across providers. */
  cachedInputTokens: z.number().int().nonnegative().optional(),
});
export type Usage = z.infer<typeof Usage>;

export const NormalizedChatResponse = z.object({
  requestId: z.string().uuid(),
  provider: z.string(),
  model: z.string(),
  text: z.string().optional(),
  toolCalls: z.array(ToolCallContent).optional(),
  usage: Usage,
  finishReason: FinishReason,
  providerMeta: z.record(z.unknown()).optional(),
});
export type NormalizedChatResponse = z.infer<typeof NormalizedChatResponse>;

/** Streaming chunk shape (SSE-serializable; full response arrives in final chunk). */
export const NormalizedChunk = z.object({
  kind: z.enum(["text_delta", "tool_call_delta", "done"]),
  text: z.string().optional(),
  toolCall: z.partial(ToolCallContent).optional(),
  usage: Usage.optional(),
  finishReason: FinishReason.optional(),
});
export type NormalizedChunk = z.infer<typeof NormalizedChunk>;

// ---------- Errors ----------

/**
 * Error classes drive retry/fallback policy (ARCHITECTURE §6). Adapters MUST
 * map vendor errors into exactly one of these.
 */
export const ProviderErrorClass = z.enum([
  "rate_limited",
  "overloaded",
  "timeout",
  "invalid_request",
  "authentication",
  "quota_exceeded",
  "model_unavailable",
  "unknown",
]);
export type ProviderErrorClass = z.infer<typeof ProviderErrorClass>;

export const RETRYABLE_ERROR_CLASSES: readonly ProviderErrorClass[] = [
  "rate_limited",
  "overloaded",
  "timeout",
] as const;

export function isRetryable(errClass: ProviderErrorClass): boolean {
  return RETRYABLE_ERROR_CLASSES.includes(errClass);
}

export const ProviderErrorPayload = z.object({
  errorClass: ProviderErrorClass,
  provider: z.string(),
  message: z.string().max(2000), // sanitized, generic — never raw upstream bodies with keys
  retryAfterSeconds: z.number().int().nonnegative().optional(),
  requestId: z.string().optional(),
});
export type ProviderErrorPayload = z.infer<typeof ProviderErrorPayload>;

// ---------- Model metadata / registry ----------

export const ModelCapabilities = z.object({
  streaming: z.boolean(),
  tools: z.boolean(),
  vision: z.boolean(),
  jsonMode: z.boolean(),
});
export type ModelCapabilities = z.infer<typeof ModelCapabilities>;

export const ModelInfo = z.object({
  id: z.string(), // gateway-internal model id
  provider: z.string(),
  vendorModel: z.string(), // vendor-facing name — gateway-only, never leaks to callers
  roles: z.array(ModelRole),
  capabilities: ModelCapabilities,
  contextWindow: z.number().int().positive(),
  pricingCreditsPerMTok: z.object({ input: z.number(), output: z.number() }),
  enabled: z.boolean(),
});
export type ModelInfo = z.infer<typeof ModelInfo>;

// ---------- Adapter port (interface only; implementations live in gateway) ----------

export interface GatewayCallContext {
  traceId: string;
  signal?: AbortSignal;
}

export interface LLMProviderAdapter {
  id: string; // 'openai' | 'anthropic' | 'qwen' | ...
  capabilities(): Promise<ModelCapabilities>;
  listModels(): Promise<ModelInfo[]>;
  complete(req: NormalizedChatRequest, ctx: GatewayCallContext): AsyncIterable<NormalizedChunk>;
}
