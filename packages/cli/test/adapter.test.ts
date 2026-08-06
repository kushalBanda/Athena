import { describe, expect, it } from "bun:test";
import type { AgentCallbacks as TuiCallbacks, AgentStatus } from "@athena/tui";
import { createCallbacks, type AdapterState } from "../src/adapter.js";

function makeFakeTui(): { tui: TuiCallbacks; statuses: AgentStatus[]; tokenCalls: Array<[number, number]> } {
  const statuses: AgentStatus[] = [];
  const tokenCalls: Array<[number, number]> = [];
  const tui: TuiCallbacks = {
    addMessage: () => {},
    updateMessage: () => {},
    setModel: () => {},
    addTokens: (input, output) => tokenCalls.push([input, output]),
    setStatus: (s) => statuses.push(s),
    setContextLimit: () => {},
    addCost: () => {},
    clearMessages: () => {},
    pickFromList: async () => null,
  };
  return { tui, statuses, tokenCalls };
}

function freshState(): AdapterState {
  return { currentToolCallId: null, streamingMessageId: null, streamingContent: "" };
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

describe("createCallbacks token double-counting fix", () => {
  it("onTokenUpdate does not call tui.addTokens (accumulation happens once, in index.ts, after runAgent resolves)", () => {
    const { tui, tokenCalls } = makeFakeTui();
    const cb = createCallbacks(tui, freshState());

    cb.onTokenUpdate(12, 5);
    cb.onTokenUpdate(20, 9); // simulates a second internal turn's cumulative total

    expect(tokenCalls).toEqual([]);
  });
});
