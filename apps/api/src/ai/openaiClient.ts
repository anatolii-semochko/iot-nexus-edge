// OpenAI and OpenAI-compatible servers (a local model behind Ollama /
// LM Studio / vLLM - `endpoint` = its /v1 base URL) - one client of the AI
// layer (ai/vision.ts AiClient): Chat Completions (with function calling for
// the agent's tools); an image analysis with a
// strict JSON-schema response format, the image as a base64 data URL.

import OpenAI from "openai";

import type {
  AiClient,
  AiConnectionInfo,
  ChatRequest,
  ChatResult,
  CompletionRequest,
  CompletionResult,
  VisionRequest,
  VisionResult,
} from "./vision.js";

export function createOpenAiClient(
  connection: AiConnectionInfo,
  options: {
    apiKey: string | null;
    endpoint: string | null;
    timeoutMs: number;
    chatTimeoutMs: number;
    maxOutputTokens: number;
  },
): AiClient {
  const client = new OpenAI({
    // a local server may need no key - the SDK still wants a string
    apiKey: options.apiKey ?? "not-needed",
    ...(options.endpoint ? { baseURL: options.endpoint } : {}),
    timeout: options.timeoutMs,
    maxRetries: 0,
  });
  const usageOf = (u: OpenAI.Completions.CompletionUsage | undefined) =>
    u
      ? {
          inputTokens: u.prompt_tokens,
          outputTokens: u.completion_tokens,
          totalTokens: u.total_tokens,
        }
      : null;

  return {
    connection,
    async complete(request: CompletionRequest): Promise<CompletionResult> {
      const started = Date.now();
      const completion = await client.chat.completions.create({
        model: connection.model,
        max_tokens: request.maxTokens ?? options.maxOutputTokens,
        messages: [
          ...(request.system
            ? [{ role: "system" as const, content: request.system }]
            : []),
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
    async chat(request: ChatRequest): Promise<ChatResult> {
      const started = Date.now();
      const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
        { role: "system", content: request.system },
      ];
      for (const m of request.messages) {
        if (m.role === "user")
          messages.push({ role: "user", content: m.content });
        else if (m.role === "assistant")
          messages.push({
            role: "assistant",
            content: m.content || null,
            ...(m.toolCalls?.length
              ? {
                  tool_calls: m.toolCalls.map((c) => ({
                    id: c.id,
                    type: "function" as const,
                    function: {
                      name: c.name,
                      arguments: JSON.stringify(c.input),
                    },
                  })),
                }
              : {}),
          });
        else
          messages.push({
            role: "tool",
            tool_call_id: m.toolCallId,
            content: m.isError ? `ERROR: ${m.content}` : m.content,
          });
      }
      const completion = await client.chat.completions.create(
        {
          model: connection.model,
          max_tokens: request.maxTokens ?? options.maxOutputTokens,
          messages,
          ...(request.tools.length
            ? {
                tools: request.tools.map((t) => ({
                  type: "function" as const,
                  function: {
                    name: t.name,
                    description: t.description,
                    parameters: t.input,
                  },
                })),
              }
            : {}),
        },
        { timeout: options.chatTimeoutMs },
      );
      const message = completion.choices[0]?.message;
      const toolCalls = (message?.tool_calls ?? [])
        .filter((c) => c.type === "function")
        .map((c) => {
          let input: Record<string, unknown> = {};
          try {
            input = JSON.parse(c.function.arguments || "{}");
          } catch {
            input = { _unparsed: c.function.arguments };
          }
          return { id: c.id, name: c.function.name, input };
        });
      return {
        content: message?.content ?? "",
        toolCalls,
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
              {
                type: "image_url",
                image_url: {
                  url: `data:${request.mimeType};base64,${request.image.toString("base64")}`,
                },
              },
            ],
          },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: request.schemaName,
            schema: request.schema,
            strict: true,
          },
        },
      });
      const content = completion.choices[0]?.message?.content;
      if (!content)
        throw new Error(`${connection.name}: no content in the answer`);
      return {
        output: JSON.parse(content) as T,
        model: completion.model,
        usage: usageOf(completion.usage),
        latencyMs: Date.now() - started,
      };
    },
  };
}
