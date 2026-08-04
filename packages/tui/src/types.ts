export type Role = "user" | "assistant" | "system";

export interface ToolCall {
  id: string;
  name: string;
  args: string;
  status: "pending" | "ok" | "err";
  summary?: string;
}

export interface Message {
  id: string;
  role: Role;
  content?: string;
  toolCalls?: ToolCall[];
  streaming?: boolean;
}

export interface PickerState {
  title: string;
  options: string[];
}

export interface AppState {
  messages: Message[];
  thinking: boolean;
  model: string;
  cwd: string;
  inputTokens: number;
  outputTokens: number;
  picker: PickerState | null;
}
