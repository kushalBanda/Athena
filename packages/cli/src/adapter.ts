import type {
  ActiveToolCall,
  AgentMessage,
  AgentCallbacks as CoreCallbacks,
} from "@athena/agent-core";
import type { Message, AgentCallbacks as TuiCallbacks } from "@athena/tui";
import { parseUnifiedDiff } from "./diff-parse.js";

export function agentMessagesToTuiMessages(messages: AgentMessage[]): Message[] {
  const out: Message[] = [];
  for (const msg of messages) {
    if (msg.role === "user") {
      out.push({
        id: msg.id,
        role: "user",
        content: typeof msg.content === "string" ? msg.content : extractText(msg.content),
      });
      continue;
    }
    if (msg.role === "compaction_summary") {
      const text = typeof msg.content === "string" ? msg.content : extractText(msg.content);
      out.push({ id: msg.id, role: "system", content: `[compacted] ${text}` });
      continue;
    }
    if (msg.role === "assistant") {
      if (typeof msg.content === "string") {
        out.push({ id: msg.id, role: "assistant", content: msg.content });
        continue;
      }
      const text = extractText(msg.content);
      const toolCalls = msg.content
        .filter((b): b is Extract<typeof b, { type: "tool_call" }> => b.type === "tool_call")
        .map((b) => ({
          id: b.id,
          name: b.name,
          args: JSON.stringify(b.input),
          status: "ok" as const,
        }));
      out.push({
        id: msg.id,
        role: "assistant",
        ...(text ? { content: text } : {}),
        ...(toolCalls.length > 0 ? { toolCalls } : {}),
      });
      continue;
    }
    if (msg.role === "tool_result") {
      const blocks = Array.isArray(msg.content) ? msg.content : [];
      const toolCalls = blocks
        .filter((b): b is Extract<typeof b, { type: "tool_result" }> => b.type === "tool_result")
        .map((b) => {
          const firstLine = b.content.split("\n", 1)[0] ?? "";
          const hasMoreThanSummary = b.content.length > 120 || b.content.includes("\n");
          return {
            id: b.toolCallId,
            name: "",
            args: "",
            status: b.isError ? ("err" as const) : ("ok" as const),
            summary: firstLine.slice(0, 120),
            ...(hasMoreThanSummary ? { resultText: b.content.slice(0, 4000) } : {}),
          };
        });
      if (toolCalls.length > 0) out.push({ id: msg.id, role: "assistant", toolCalls });
    }
  }
  return out;
}

function extractText(blocks: Array<{ type: string; text?: string }>): string {
  return blocks
    .filter((b): b is { type: "text"; text: string } => b.type === "text")
    .map((b) => b.text)
    .join("");
}

export interface AdapterState {
  currentToolCallId: string | null;
  streamingMessageId: string | null;
  streamingContent: string;
  lastInputTokens: number;
  lastOutputTokens: number;
  lastCacheReadTokens: number;
  lastCacheWriteTokens: number;
}

export function createCallbacks(
  tui: TuiCallbacks,
  state: AdapterState,
  permissionRequest?: (toolName: string, input: unknown) => Promise<boolean>,
): CoreCallbacks {
  return {
    onThinking: (active: boolean) => {
      tui.setStatus({ kind: active ? "thinking" : "ready" });
    },

    onAssistantToken: (token: string) => {
      if (state.streamingMessageId === null) {
        const id = crypto.randomUUID();
        state.streamingMessageId = id;
        state.streamingContent = token;
        tui.addMessage({ id, role: "assistant", content: token, streaming: true });
      } else {
        state.streamingContent += token;
        tui.updateMessage(state.streamingMessageId, {
          content: state.streamingContent,
          streaming: true,
        });
      }
    },

    onToolCall: (call: ActiveToolCall) => {
      if (state.streamingMessageId !== null) {
        tui.updateMessage(state.streamingMessageId, { streaming: false });
        state.streamingMessageId = null;
        state.streamingContent = "";
      }
      state.currentToolCallId = call.id;
      tui.setStatus({ kind: "tool", name: call.name });
      const msg: Message = {
        id: crypto.randomUUID(),
        role: "assistant",
        toolCalls: [
          { id: call.id, name: call.name, args: JSON.stringify(call.input), status: "pending" },
        ],
      };
      tui.addMessage(msg);
    },

    onToolResult: (
      id: string,
      result: string,
      status: "ok" | "err",
      metadata?: Record<string, unknown>,
    ) => {
      state.currentToolCallId = null;
      if (status === "err") {
        tui.setStatus({ kind: "error", message: result.slice(0, 120) });
      }
      const diffPatch = typeof metadata?.diff === "string" ? metadata.diff : undefined;
      const firstLine = result.split("\n", 1)[0] ?? "";
      // Only surface a separate result block when there's more to show than the summary
      // line already covers — avoids repeating a short single-line result twice.
      const hasMoreThanSummary = result.length > 120 || result.includes("\n");
      const msg: Message = {
        id: crypto.randomUUID(),
        role: "assistant",
        toolCalls: [
          {
            id,
            name: "",
            args: "",
            status,
            summary: firstLine.slice(0, 120),
            ...(hasMoreThanSummary ? { resultText: result.slice(0, 4000) } : {}),
            ...(diffPatch !== undefined ? { diff: parseUnifiedDiff(diffPatch) } : {}),
          },
        ],
      };
      tui.addMessage(msg);
    },

    onCompacting: () => {
      tui.setStatus({ kind: "compacting" });
      tui.addMessage({
        id: crypto.randomUUID(),
        role: "assistant",
        content: "[Compacting context…]",
      });
    },

    onCompactingDone: () => {
      tui.setStatus({ kind: "ready" });
    },

    onRetrying: (attempt: number, maxAttempts: number, delayMs: number, reason: string) => {
      // Discard partial streamed text so the retry does not append onto stale text.
      if (state.streamingMessageId !== null) {
        tui.updateMessage(state.streamingMessageId, { content: "", streaming: false });
        state.streamingMessageId = null;
        state.streamingContent = "";
      }
      tui.setStatus({ kind: "retrying", attempt, maxAttempts, delayMs, reason });
    },

    onTokenUpdate: (input: number, output: number, cacheRead = 0, cacheWrite = 0) => {
      tui.addTokens(
        input - state.lastInputTokens,
        output - state.lastOutputTokens,
        cacheRead - state.lastCacheReadTokens,
        cacheWrite - state.lastCacheWriteTokens,
      );
      state.lastInputTokens = input;
      state.lastOutputTokens = output;
      state.lastCacheReadTokens = cacheRead;
      state.lastCacheWriteTokens = cacheWrite;
    },

    ...(permissionRequest !== undefined ? { onPermissionRequest: permissionRequest } : {}),
  };
}

export function finalizeStream(tui: TuiCallbacks, state: AdapterState): void {
  if (state.streamingMessageId !== null) {
    tui.updateMessage(state.streamingMessageId, { streaming: false });
    state.streamingMessageId = null;
    state.streamingContent = "";
  }
}
