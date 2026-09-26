// OpenAI implementation of the AI layer's VisionProvider (AGENTS.md
// section 82) - same `openai` npm client as ai-job-analyzer, key and
// model from .env (OPENAI_API_KEY / OPENAI_MODEL). Chat Completions with a
// strict JSON-schema response format, one image as a base64 data URL.

import OpenAI from "openai";

import type { VisionProvider, VisionRequest, VisionResult } from "./vision.js";

export function createOpenAiVision(options: { apiKey: string; model: string; timeoutMs: number }): VisionProvider {
  const client = new OpenAI({ apiKey: options.apiKey, timeout: options.timeoutMs, maxRetries: 0 });

  return {
    name: "openai",
    async analyzeImage<T>(request: VisionRequest): Promise<VisionResult<T>> {
      const started = Date.now();
      const completion = await client.chat.completions.create({
        model: options.model,
        messages: [
          { role: "system", content: request.instructions },
          {
            role: "user",
            content: [
              { type: "text", text: request.prompt },
              {
                type: "image_url",
                image_url: { url: `data:${request.mimeType};base64,${request.image.toString("base64")}` },
              },
            ],
          },
        ],
        response_format: {
          type: "json_schema",
          json_schema: { name: request.schemaName, schema: request.schema, strict: true },
        },
      });

      const content = completion.choices[0]?.message?.content;
      if (!content) throw new Error("OpenAI returned no content");
      return {
        output: JSON.parse(content) as T,
        model: completion.model,
        usage: completion.usage
          ? {
              inputTokens: completion.usage.prompt_tokens,
              outputTokens: completion.usage.completion_tokens,
              totalTokens: completion.usage.total_tokens,
            }
          : null,
        latencyMs: Date.now() - started,
      };
    },
  };
}
