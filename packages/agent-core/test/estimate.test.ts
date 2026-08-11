import { describe, expect, it } from "bun:test";
import { estimateContextTokens, estimateTokens } from "../src/compaction/estimate.js";
import type { AgentMessage } from "../src/types.js";

function makeMsg(
  role: AgentMessage["role"],
  content: string,
  usage?: AgentMessage["usage"],
): AgentMessage {
  return { id: "x", role, content, usage, timestamp: 0 };
}

describe("estimateTokens", () => {
  it("estimates string content as chars/4", () => {
    const msg = makeMsg("user", "1234");
    expect(estimateTokens(msg)).toBe(1);
  });

  it("handles block content", () => {
    const msg: AgentMessage = {
      id: "x",
      role: "assistant",
      content: [{ type: "text", text: "hello world" }],
      timestamp: 0,
    };
    expect(estimateTokens(msg)).toBeGreaterThan(0);
  });
});

describe("estimateContextTokens", () => {
  it("returns char-based estimate when no usage", () => {
    const msgs = [makeMsg("user", "a".repeat(400)), makeMsg("assistant", "b".repeat(400))];
    const result = estimateContextTokens(msgs);
    expect(result.hasRealUsage).toBe(false);
    expect(result.tokens).toBe(200);
  });

  it("uses real usage from last assistant message", () => {
    const usage = { input: 1000, output: 200, cacheRead: 0, cacheWrite: 0, totalTokens: 1200 };
    const msgs = [
      makeMsg("user", "hello"),
      makeMsg("assistant", "world", usage),
      makeMsg("user", "a".repeat(400)),
    ];
    const result = estimateContextTokens(msgs);
    expect(result.hasRealUsage).toBe(true);
    expect(result.tokens).toBe(1200 + 100);
  });
});
