// OpenAI and OpenAI-compatible servers (a local model behind Ollama /
// LM Studio / vLLM - `endpoint` = its /v1 base URL) - one client of the AI
// layer (ai/vision.ts AiClient): Chat Completions; an image analysis with a
// strict JSON-schema response format, the image as a base64 data URL.

import OpenAI from "openai";

import type { AiClient, AiConnectionInfo, CompletionRequest, CompletionResult, VisionRequest, VisionResult } from "./vision.js";

export function createOpenAiClient(
  connection: AiConnectionInfo,
  options: { apiKey: string | null; endpoint: string | null; timeoutMs: number; maxOutputTokens: number },
): AiClient {
  const client = new OpenAI({
    // a local server may need no key - the SDK still wants a string
    apiKey: options.apiKey ?? "not-needed",
    ...(options.endpoint ? { baseURL: options.endpoint } : {}),
    timeout: options.timeoutMs,
    maxRetries: 0,
  });
  const usageOf = (u: OpenAI.Completions.CompletionUsage | undefined) =>
    u ? { inputTokens: u.prompt_tokens, outputTokens: u.completion_tokens, totalTokens: u.total_tokens } : null;

  return {
    connection,
    async complete(request: CompletionRequest): Promise<CompletionResult> {
      const started = Date.now();
      const completion = await client.chat.completions.create({
        model: connection.model,
        max_tokens: request.maxTokens ?? options.maxOutputTokens,
        messages: [
          ...(request.system ? [{ role: "system" as const, content: request.system }] : []),
          { role: "user" as const, content: request.prompt },
        ],
      });
      return {
        text: completion.choices[0]?.message?.content ?? "",
        model: completion.model,
        usage: usageOf(completion.usage),
        latencyMs: Date.now() - started,
      };
    },
    async analyzeImage<T>(request: VisionRequest): Promise<VisionResult<T>> {
      const started = Date.now();
      const completion = await client.chat.completions.create({
        model: connection.model,
        max_tokens: options.maxOutputTokens,
        messages: [
          { role: "system", content: request.instructions },
          {
            role: "user",
            content: [
              { type: "text", text: request.prompt },
              { type: "image_url", image_url: { url: `data:${request.mimeType};base64,${request.image.toString("base64")}` } },
            ],
          },
        ],
        response_format: { type: "json_schema", json_schema: { name: request.schemaName, schema: request.schema, strict: true } },
      });
      const content = completion.choices[0]?.message?.content;
      if (!content) throw new Error(`${connection.name}: no content in the answer`);
      return { output: JSON.parse(content) as T, model: completion.model, usage: usageOf(completion.usage), latencyMs: Date.now() - started };
    },
  };
}
