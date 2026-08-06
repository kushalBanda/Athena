import type { AgentCallbacks as CoreCallbacks, ActiveToolCall } from "@athena/agent-core";
import type { AgentCallbacks as TuiCallbacks, Message } from "@athena/tui";

export interface AdapterState {
  currentToolCallId: string | null;
  streamingMessageId: string | null;
  streamingContent: string;
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
        // first token: create streaming message
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
      // finalize any in-progress stream before showing tool call
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
        toolCalls: [{ id: call.id, name: call.name, args: JSON.stringify(call.input), status: "pending" }],
      };
      tui.addMessage(msg);
    },

    onToolResult: (id: string, result: string, status: "ok" | "err") => {
      state.currentToolCallId = null;
      if (status === "err") {
        tui.setStatus({ kind: "error", message: result.slice(0, 120) });
      }
      const msg: Message = {
        id: crypto.randomUUID(),
        role: "assistant",
        toolCalls: [{ id, name: "", args: "", status, summary: result.slice(0, 120) }],
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

    onTokenUpdate: (_input: number, _output: number) => {},

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
