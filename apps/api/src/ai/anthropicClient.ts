// Anthropic (Claude) - one client of the AI layer (ai/vision.ts AiClient):
// the Messages API over fetch (no SDK dependency). An image analysis forces
// one tool whose input schema is the requested JSON schema - its input is
// the structured answer.

import type { AiClient, AiConnectionInfo, CompletionRequest, CompletionResult, TokenUsage, VisionRequest, VisionResult } from "./vision.js";

const DEFAULT_ENDPOINT = "https://api.anthropic.com";
const API_VERSION = "2023-06-01";

interface MessagesAnswer {
  model: string;
  content: { type: string; text?: string; name?: string; input?: unknown }[];
  usage?: { input_tokens: number; output_tokens: number };
}

export function createAnthropicClient(
  connection: AiConnectionInfo,
  options: { apiKey: string | null; endpoint: string | null; timeoutMs: number; maxOutputTokens: number },
): AiClient {
  const base = (options.endpoint ?? DEFAULT_ENDPOINT).replace(/\/+$/, "");
  const call = async (body: object): Promise<MessagesAnswer> => {
    const res = await fetch(`${base}/v1/messages`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": options.apiKey ?? "", "anthropic-version": API_VERSION },
      body: JSON.stringify({ model: connection.model, ...body }),
      signal: AbortSignal.timeout(options.timeoutMs),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`${connection.name}: ${res.status} ${text.slice(0, 500)}`);
    return JSON.parse(text) as MessagesAnswer;
  };
  const usageOf = (u: MessagesAnswer["usage"]): TokenUsage | null =>
    u ? { inputTokens: u.input_tokens, outputTokens: u.output_tokens, totalTokens: u.input_tokens + u.output_tokens } : null;

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
        text: answer.content.filter((c) => c.type === "text").map((c) => c.text ?? "").join(""),
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
        tools: [{ name: request.schemaName, description: "The structured answer", input_schema: request.schema }],
        tool_choice: { type: "tool", name: request.schemaName },
        messages: [
          {
            role: "user",
            content: [
              { type: "image", source: { type: "base64", media_type: request.mimeType, data: request.image.toString("base64") } },
              { type: "text", text: request.prompt },
            ],
          },
        ],
      });
      const tool = answer.content.find((c) => c.type === "tool_use");
      if (!tool) throw new Error(`${connection.name}: no structured answer`);
      return { output: tool.input as T, model: answer.model, usage: usageOf(answer.usage), latencyMs: Date.now() - started };
    },
  };
}
