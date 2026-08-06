import { describe, expect, it } from "bun:test";
import type { AgentCallbacks as TuiCallbacks, AgentStatus, Message } from "@athena/tui";
import { createCallbacks, type AdapterState } from "../src/adapter.js";

function makeFakeTui(): {
  tui: TuiCallbacks;
  statuses: AgentStatus[];
  tokenCalls: Array<[number, number]>;
  messages: Message[];
} {
  const statuses: AgentStatus[] = [];
  const tokenCalls: Array<[number, number]> = [];
  const messages: Message[] = [];
  const tui: TuiCallbacks = {
    addMessage: (m) => messages.push(m),
    updateMessage: () => {},
    setModel: () => {},
    addTokens: (input, output) => tokenCalls.push([input, output]),
    setStatus: (s) => statuses.push(s),
    setContextLimit: () => {},
    addCost: () => {},
    clearMessages: () => {},
    pickFromList: async () => null,
  };
  return { tui, statuses, tokenCalls, messages };
}

function freshState(): AdapterState {
  return {
    currentToolCallId: null,
    streamingMessageId: null,
    streamingContent: "",
    lastInputTokens: 0,
    lastOutputTokens: 0,
  };
}

describe("createCallbacks status mapping", () => {
  it("maps onThinking(true) to a thinking status and onThinking(false) to ready", () => {
    const { tui, statuses } = makeFakeTui();
    const cb = createCallbacks(tui, freshState());

    cb.onThinking(true);
    cb.onThinking(false);

    expect(statuses).toEqual([{ kind: "thinking" }, { kind: "ready" }]);
  });

  it("maps onToolCall to a tool status carrying the tool name", () => {
    const { tui, statuses } = makeFakeTui();
    const cb = createCallbacks(tui, freshState());

    cb.onToolCall({ id: "1", name: "grep", input: {} });

    expect(statuses).toEqual([{ kind: "tool", name: "grep" }]);
  });

  it("maps a failed onToolResult to an error status with the truncated message", () => {
    const { tui, statuses } = makeFakeTui();
    const cb = createCallbacks(tui, freshState());

    cb.onToolResult("1", "boom", "err");

    expect(statuses).toEqual([{ kind: "error", message: "boom" }]);
  });

  it("does not change status on a successful onToolResult", () => {
    const { tui, statuses } = makeFakeTui();
    const cb = createCallbacks(tui, freshState());

    cb.onToolResult("1", "ok result", "ok");

    expect(statuses).toEqual([]);
  });

  it("maps onCompacting to a compacting status", () => {
    const { tui, statuses } = makeFakeTui();
    const cb = createCallbacks(tui, freshState());

    cb.onCompacting();

    expect(statuses).toEqual([{ kind: "compacting" }]);
  });
});

describe("createCallbacks diff metadata", () => {
  it("populates ToolCall.diff when metadata.diff is a unified diff string", () => {
    const { tui, messages } = makeFakeTui();
    const cb = createCallbacks(tui, freshState());

    cb.onToolResult("1", "Edited /tmp/a.txt (+1 -1)", "ok", {
      diff: "--- a.txt\n+++ a.txt\n@@ -1,1 +1,1 @@\n-old\n+new\n",
      additions: 1,
      deletions: 1,
    });

    expect(messages).toHaveLength(1);
    expect(messages[0]!.toolCalls?.[0]!.diff).toEqual([
      { type: "del", text: "old" },
      { type: "add", text: "new" },
    ]);
  });

  it("leaves ToolCall.diff undefined when metadata has no diff", () => {
    const { tui, messages } = makeFakeTui();
    const cb = createCallbacks(tui, freshState());

    cb.onToolResult("1", "ok result", "ok");

    expect(messages[0]!.toolCalls?.[0]!.diff).toBeUndefined();
  });
});

describe("createCallbacks live token updates", () => {
  it("onTokenUpdate reports per-turn deltas from cumulative totals, so the status bar updates as the agent streams", () => {
    const { tui, tokenCalls } = makeFakeTui();
    const state = freshState();
    const cb = createCallbacks(tui, state);

    cb.onTokenUpdate(12, 5);
    cb.onTokenUpdate(20, 9); // second internal turn's cumulative total

    expect(tokenCalls).toEqual([
      [12, 5],
      [8, 4],
    ]);
  });
});
