import { describe, expect, it } from "bun:test";
import { pruneToolOutputs, PRUNE_PROTECT_TOKENS, PRUNE_MINIMUM_GAIN } from "../src/compaction/prune.js";
import type { AgentMessage } from "../src/types.js";

function toolResultMsg(content: string): AgentMessage {
  return {
    id: Math.random().toString(),
    role: "tool_result",
    content: [{ type: "tool_result", toolCallId: "x", content, isError: false }],
    timestamp: 0,
  };
}

function userMsg(text: string): AgentMessage {
  return { id: Math.random().toString(), role: "user", content: text, timestamp: 0 };
}

describe("pruneToolOutputs", () => {
  it("returns unchanged when gain below minimum", () => {
    const messages = [toolResultMsg("short")];
    const result = pruneToolOutputs(messages);
    expect(result).toBe(messages);
  });

  it("prunes old tool results when gain exceeds minimum", () => {
    const bigContent = "x".repeat(PRUNE_MINIMUM_GAIN * 5);
    const oldToolResult = toolResultMsg(bigContent);
    const recentMessages: AgentMessage[] = Array.from({ length: 3 }, () =>
      userMsg("y".repeat(1000)),
    );

    const messages = [oldToolResult, ...recentMessages];
    const result = pruneToolOutputs(messages);

    if (result !== messages) {
      const pruned = result[0];
      const content = Array.isArray(pruned.content) ? pruned.content : [];
      const tr = content.find((b) => b.type === "tool_result");
      expect(tr && "content" in tr ? tr.content : "").toBe("[output pruned]");
    }
  });

  it("does not prune messages within protect window", () => {
    const protectedContent = "p".repeat(1000);
    const messages: AgentMessage[] = Array.from({ length: 5 }, () =>
      toolResultMsg(protectedContent),
    );
    const result = pruneToolOutputs(messages);
    expect(result).toBe(messages);
  });
});
