import { describe, expect, it } from "bun:test";
import { findCutPoint } from "../src/compaction/cut-point.js";
import type { AgentMessage } from "../src/types.js";

function msg(role: AgentMessage["role"], chars = 100): AgentMessage {
  return { id: `${role}_${Math.random()}`, role, content: "x".repeat(chars), timestamp: 0 };
}

describe("findCutPoint", () => {
  it("keeps recent tokens within budget", () => {
    const messages = [
      msg("user"),
      msg("assistant"),
      msg("user"),
      msg("assistant"),
      msg("user"),
      msg("assistant"),
    ];
    // each msg = 100 chars = 25 tokens; keep 50 tokens = keep last 2 msgs
    const { cutIndex } = findCutPoint(messages, 50);
    expect(cutIndex).toBeGreaterThan(0);
    expect(cutIndex).toBeLessThan(messages.length);
  });

  it("cut always at user or assistant role, not tool_result", () => {
    const messages: AgentMessage[] = [
      msg("user"),
      msg("assistant"),
      {
        id: "tr",
        role: "tool_result",
        content: [
          { type: "tool_result", toolCallId: "x", content: "x".repeat(100), isError: false },
        ],
        timestamp: 0,
      },
      msg("user"),
    ];
    const { cutIndex } = findCutPoint(messages, 10);
    const cutMsg = messages[cutIndex];
    expect(["user", "assistant", "compaction_summary"]).toContain(cutMsg?.role ?? "user");
  });

  it("cutIndex = 1 min when all fits in budget", () => {
    const messages = [msg("user"), msg("assistant")];
    const { cutIndex } = findCutPoint(messages, 9999);
    expect(cutIndex).toBeGreaterThanOrEqual(1);
  });
});
