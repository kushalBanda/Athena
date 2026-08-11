export type MessageRole = "user" | "assistant" | "tool_result" | "compaction_summary";

export interface TextBlock {
  type: "text";
  text: string;
}

export interface ToolCallBlock {
  type: "tool_call";
  id: string;
  name: string;
  input: unknown;
}

export interface ToolResultBlock {
  type: "tool_result";
  toolCallId: string;
  content: string;
  isError: boolean;
}

export type ContentBlock = TextBlock | ToolCallBlock | ToolResultBlock;

export interface AgentMessage {
  id: string;
  role: MessageRole;
  content: string | ContentBlock[];
  usage?: TokenUsage;
  timestamp: number;
}

export interface ToolCall {
  id: string;
  name: string;
  input: unknown;
}

export interface ToolResult {
  toolCallId: string;
  content: string;
  isError: boolean;
  metadata?: Record<string, unknown>;
}

export interface TokenUsage {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  totalTokens: number;
  costUsd?: number;
}

export interface CompactionSettings {
  enabled: boolean;
  reserveTokens: number;
  keepRecentTokens: number;
}

export interface CompactionResult {
  summary: string;
  firstKeptMessageId: string;
  tokensBefore: number;
  retainedTail: AgentMessage[];
  fileOps: { readFiles: string[]; modifiedFiles: string[] };
}

export interface ActiveToolCall {
  id: string;
  name: string;
  input: unknown;
}

export interface AgentCallbacks {
  onThinking: (active: boolean) => void;
  onAssistantToken: (token: string) => void;
  onToolCall: (toolCall: ActiveToolCall) => void;
  onToolResult: (
    id: string,
    result: string,
    status: "ok" | "err",
    metadata?: Record<string, unknown>,
  ) => void;
  onCompacting: () => void;
  onTokenUpdate: (input: number, output: number, cacheRead?: number, cacheWrite?: number) => void;
  onPermissionRequest?: (toolName: string, input: unknown) => Promise<boolean>;
  /** Called when the loop is about to retry after a transient provider-call failure. */
  onRetrying?: (attempt: number, maxAttempts: number, delayMs: number, reason: string) => void;
  /** Called when a compaction pass (started via onCompacting) has finished. */
  onCompactingDone?: () => void;
}

export interface AgentSession {
  messages: AgentMessage[];
  tokenUsage: TokenUsage;
}

export interface ContextUsageEstimate {
  tokens: number;
  hasRealUsage: boolean;
}

export interface CutPointResult {
  cutIndex: number;
  isSplitTurn: boolean;
}
