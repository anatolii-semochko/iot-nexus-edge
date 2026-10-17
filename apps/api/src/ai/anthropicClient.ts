// Anthropic (Claude) - one client of the AI layer (ai/vision.ts AiClient):
// the Messages API over fetch (no SDK dependency). An image analysis forces
// one tool whose input schema is the requested JSON schema - its input is
// the structured answer.

import type {
  AiClient,
  AiConnectionInfo,
  ChatRequest,
  ChatResult,
  CompletionRequest,
  CompletionResult,
  TokenUsage,
  VisionRequest,
  VisionResult,
} from "./vision.js";

const DEFAULT_ENDPOINT = "https://api.anthropic.com";
const API_VERSION = "2023-06-01";

interface MessagesAnswer {
  model: string;
  content: {
    type: string;
    text?: string;
    id?: string;
    name?: string;
    input?: unknown;
  }[];
  usage?: { input_tokens: number; output_tokens: number };
}

export function createAnthropicClient(
  connection: AiConnectionInfo,
  options: {
    apiKey: string | null;
    endpoint: string | null;
    timeoutMs: number;
    chatTimeoutMs: number;
    maxOutputTokens: number;
  },
): AiClient {
  const base = (options.endpoint ?? DEFAULT_ENDPOINT).replace(/\/+$/, "");
  const call = async (
    body: object,
    timeoutMs = options.timeoutMs,
  ): Promise<MessagesAnswer> => {
    const res = await fetch(`${base}/v1/messages`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": options.apiKey ?? "",
        "anthropic-version": API_VERSION,
      },
      body: JSON.stringify({ model: connection.model, ...body }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const text = await res.text();
    if (!res.ok)
      throw new Error(
        `${connection.name}: ${res.status} ${text.slice(0, 500)}`,
      );
    return JSON.parse(text) as MessagesAnswer;
  };
  const usageOf = (u: MessagesAnswer["usage"]): TokenUsage | null =>
    u
      ? {
          inputTokens: u.input_tokens,
          outputTokens: u.output_tokens,
          totalTokens: u.input_tokens + u.output_tokens,
        }
      : null;

  return {
    connection,
    async complete(request: CompletionRequest): Promise<CompletionResult> {
      const started = Date.now();
      const answer = await call({
        max_tokens: request.maxTokens ?? options.maxOutputTokens,
        ...(request.system ? { system: request.system } : {}),
        messages: [{ role: "user", content: request.prompt }],
      });
      return {
        text: answer.content
          .filter((c) => c.type === "text")
          .map((c) => c.text ?? "")
          .join(""),
        model: answer.model,
        usage: usageOf(answer.usage),
        latencyMs: Date.now() - started,
      };
    },
    async chat(request: ChatRequest): Promise<ChatResult> {
      const started = Date.now();
      // the tool results of one turn go back together in one user message
      const messages: { role: "user" | "assistant"; content: unknown }[] = [];
      for (const m of request.messages) {
        if (m.role === "user")
          messages.push({ role: "user", content: m.content });
        else if (m.role === "assistant")
          messages.push({
            role: "assistant",
            content: [
              ...(m.content ? [{ type: "text", text: m.content }] : []),
              ...(m.toolCalls ?? []).map((c) => ({
                type: "tool_use",
                id: c.id,
                name: c.name,
                input: c.input,
              })),
            ],
          });
        else {
          const block = {
            type: "tool_result",
            tool_use_id: m.toolCallId,
            content: m.content,
            ...(m.isError ? { is_error: true } : {}),
          };
          const last = messages[messages.length - 1];
          if (last?.role === "user" && Array.isArray(last.content))
            (last.content as unknown[]).push(block);
          else messages.push({ role: "user", content: [block] });
        }
      }
      const answer = await call(
        {
          max_tokens: request.maxTokens ?? options.maxOutputTokens,
          system: request.system,
          messages,
          ...(request.tools.length
            ? {
                tools: request.tools.map((t) => ({
                  name: t.name,
                  description: t.description,
                  input_schema: t.input,
                })),
              }
            : {}),
        },
        options.chatTimeoutMs,
      );
      return {
        content: answer.content
          .filter((c) => c.type === "text")
          .map((c) => c.text ?? "")
          .join(""),
        toolCalls: answer.content
          .filter((c) => c.type === "tool_use")
          .map((c) => ({
            id: c.id ?? "",
            name: c.name ?? "",
            input: (c.input ?? {}) as Record<string, unknown>,
          })),
        model: answer.model,
        usage: usageOf(answer.usage),
        latencyMs: Date.now() - started,
      };
    },
    async analyzeImage<T>(request: VisionRequest): Promise<VisionResult<T>> {
      const started = Date.now();
      const answer = await call({
        max_tokens: options.maxOutputTokens,
        system: request.instructions,
        tools: [
          {
            name: request.schemaName,
            description: "The structured answer",
            input_schema: request.schema,
          },
        ],
        tool_choice: { type: "tool", name: request.schemaName },
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: {
                  type: "base64",
                  media_type: request.mimeType,
                  data: request.image.toString("base64"),
                },
              },
              { type: "text", text: request.prompt },
            ],
          },
        ],
      });
      const tool = answer.content.find((c) => c.type === "tool_use");
      if (!tool) throw new Error(`${connection.name}: no structured answer`);
      return {
        output: tool.input as T,
        model: answer.model,
        usage: usageOf(answer.usage),
        latencyMs: Date.now() - started,
      };
    },
  };
}
