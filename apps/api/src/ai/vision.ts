// AI layer - image analysis (AGENTS.md section 82). Provider-agnostic
// contract used by process plugins (reached through the api.ts plugin
// context, apiPlugins.ts), so a process never talks to a vendor SDK
// directly and a local model can replace the cloud one later without
// touching any consumer. The providers - the AI connections (ai/
// connections.ts, Service -> Config -> AI): OpenAI / OpenAI-compatible
// (openaiClient.ts), Anthropic (anthropicClient.ts).
//
// An AI failure is never fatal to the platform: `analyzeImage` throws, the
// calling process records the error (WEM) and carries on.

import { defaultClient } from "./connections.js";

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

export interface AiConnectionInfo {
  id: number;
  name: string;
  type: "openai" | "anthropic" | "openai-compatible";
  model: string;
}

export interface CompletionRequest {
  system?: string;
  prompt: string;
  maxTokens?: number;
}

export interface CompletionResult {
  text: string;
  model: string;
  usage: TokenUsage | null;
  latencyMs: number;
}

// --- a conversation with tools (the agent - agent.ts) ---------------------------

/** A tool the model may call - its name ([a-zA-Z0-9_-]), description, input JSON Schema. */
export interface ChatToolSpec {
  name: string;
  description: string;
  input: Record<string, unknown>;
}

export interface ToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

/** The conversation, provider-neutral: each client maps it to its own API. */
export type ChatMessage =
  | { role: "user"; content: string }
  | { role: "assistant"; content: string; toolCalls?: ToolCall[] }
  | { role: "tool"; toolCallId: string; name: string; content: string; isError?: boolean };

export interface ChatRequest {
  system: string;
  messages: ChatMessage[];
  tools: ChatToolSpec[];
  maxTokens?: number;
}

export interface ChatResult {
  content: string;
  toolCalls: ToolCall[];
  model: string;
  usage: TokenUsage | null;
  latencyMs: number;
}

/**
 * One AI connection's client (ai/connections.ts - Service -> Config -> AI):
 * a plain completion (the connection test), a conversation with tools (the
 * agent) and an image analysis with a structured answer.
 */
export interface AiClient {
  connection: AiConnectionInfo;
  complete(request: CompletionRequest): Promise<CompletionResult>;
  chat(request: ChatRequest): Promise<ChatResult>;
  analyzeImage<T>(request: VisionRequest): Promise<VisionResult<T>>;
}

/** An image analysis client (what the photo / camera analysers use) - the AiClient's subset. */
export type VisionProvider = Pick<AiClient, "analyzeImage"> & { name: string };

/**
 * The default connection's client for an image analysis, or null when no
 * connection is set up (the analysers record an error then).
 */
export async function getVisionProvider(): Promise<VisionProvider | null> {
  const client = await defaultClient();
  return client ? { name: client.connection.name, analyzeImage: (r) => client.analyzeImage(r) } : null;
}
