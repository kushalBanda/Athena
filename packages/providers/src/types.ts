export type Role = "user" | "assistant" | "tool";

export interface TextContent {
  type: "text";
  text: string;
}

export interface ToolCallContent {
  type: "tool_call";
  id: string;
  name: string;
  input: unknown;
}

export interface ToolResultContent {
  type: "tool_result";
  toolCallId: string;
  content: string;
  isError?: boolean;
}

export type MessageContent = TextContent | ToolCallContent | ToolResultContent;

export interface Message {
  role: Role;
  content: MessageContent[];
}

export interface UsageDelta {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  costUsd?: number; // only set if the provider's API response includes it
}

export type Delta =
  | { type: "text"; text: string }
  | { type: "tool_call"; id: string; name: string; inputChunk: string }
  | { type: "usage"; usage: UsageDelta }
  | { type: "done" };

export interface ToolDef {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface LLMProvider {
  readonly name: string;
  readonly model: string;
  readonly contextLimit: number;
  chat(messages: Message[], tools: ToolDef[], systemPrompt?: string): AsyncIterable<Delta>;
  countTokens(messages: Message[]): Promise<number>;
}
