// AI layer - image analysis (AGENTS.md section 82). Provider-agnostic
// contract used by process plugins (reached through the api.ts plugin
// context, apiPlugins.ts), so a process never talks to a vendor SDK
// directly and a local model can replace the cloud one later without
// touching any consumer. One provider today: OpenAI (openaiVision.ts).
//
// An AI failure is never fatal to the platform: `analyzeImage` throws, the
// calling process records the error (WEM) and carries on.

import { config } from "../config.js";
import { createOpenAiVision } from "./openaiVision.js";

export interface VisionRequest {
  image: Buffer;
  mimeType: string;
  // System-level instructions (role, output rules).
  instructions: string;
  // The per-image request.
  prompt: string;
  // Structured output: the model must answer with JSON matching `schema`
  // (JSON Schema, strict - every property required, no extras).
  schemaName: string;
  schema: Record<string, unknown>;
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export interface VisionResult<T> {
  output: T;
  model: string;
  usage: TokenUsage | null;
  latencyMs: number;
}

export interface VisionProvider {
  name: string;
  analyzeImage<T>(request: VisionRequest): Promise<VisionResult<T>>;
}

let provider: VisionProvider | null | undefined;

/** The configured provider, or null when AI isn't configured (no key). */
export function getVisionProvider(): VisionProvider | null {
  if (provider !== undefined) return provider;
  provider = null;
  if (config.ai.provider === "openai" && config.ai.openaiApiKey) {
    provider = createOpenAiVision({
      apiKey: config.ai.openaiApiKey,
      model: config.ai.openaiModel,
      timeoutMs: config.ai.requestTimeoutMs,
    });
  }
  return provider;
}
