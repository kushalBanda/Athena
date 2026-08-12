export type Role = "user" | "assistant" | "system" | "timing";

export interface DiffLine {
  type: "add" | "del" | "ctx";
  text: string;
}

export interface ToolCall {
  id: string;
  name: string;
  args: string;
  status: "pending" | "ok" | "err";
  summary?: string;
  /** Full tool result text (e.g. web_search's formatted results), shown below the summary line. */
  resultText?: string;
  diff?: DiffLine[];
}

export interface Message {
  id: string;
  role: Role;
  content?: string;
  toolCalls?: ToolCall[];
  streaming?: boolean;
}

export interface PickerOption {
  readonly label: string;
  readonly value: string;
  readonly hint?: string;
  readonly tone?: "success" | "muted" | "danger";
}

export interface PickerState {
  title: string;
  options: readonly (string | PickerOption)[];
  onToggle?: (value: string) => readonly (string | PickerOption)[];
}

export interface TextPromptState {
  title: string;
  mask: boolean;
}

export type AgentStatus =
  | { readonly kind: "ready" }
  | { readonly kind: "thinking" }
  | { readonly kind: "tool"; readonly name: string }
  | { readonly kind: "compacting" }
  | {
      readonly kind: "retrying";
      readonly attempt: number;
      readonly maxAttempts: number;
      readonly delayMs: number;
      readonly reason: string;
    }
  | { readonly kind: "error"; readonly message: string };

export interface AppState {
  messages: Message[];
  status: AgentStatus;
  model: string;
  effort: string | undefined;
  cwd: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  contextLimit?: number;
  costUsd?: number;
  picker: PickerState | null;
  textPrompt: TextPromptState | null;
  ctrlCArmed: boolean;
  queuedMessages: string[];
  customCommands: { name: string; description: string }[];
}
