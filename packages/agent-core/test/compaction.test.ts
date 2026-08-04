import { describe, expect, it } from "bun:test";
import { compact, shouldCompact, DEFAULT_COMPACTION_SETTINGS } from "../src/compaction/index.js";
import type { AgentMessage } from "../src/types.js";
import { makeMockProvider } from "./helpers.js";

function userMsg(text: string): AgentMessage {
  return { id: Math.random().toString(), role: "user", content: text, timestamp: 0 };
}

function assistantMsg(text: string): AgentMessage {
  return { id: Math.random().toString(), role: "assistant", content: text, timestamp: 0 };
}

describe("shouldCompact", () => {
  it("returns false when disabled", () => {
    expect(shouldCompact(190_000, 200_000, { ...DEFAULT_COMPACTION_SETTINGS, enabled: false })).toBe(false);
  });

  it("returns true when tokens exceed contextWindow - reserveTokens", () => {
    expect(shouldCompact(190_000, 200_000, DEFAULT_COMPACTION_SETTINGS)).toBe(true);
  });

  it("returns false when under threshold", () => {
    expect(shouldCompact(100_000, 200_000, DEFAULT_COMPACTION_SETTINGS)).toBe(false);
  });
});

describe("compact", () => {
  it("produces summary message and retained tail", async () => {
    const provider = makeMockProvider([
      { type: "text", text: "## Goal\nTest compaction" },
      { type: "done" },
    ]);

    const messages: AgentMessage[] = [
      userMsg("first"),
      assistantMsg("reply 1"),
      userMsg("second"),
      assistantMsg("reply 2"),
      userMsg("third"),
      assistantMsg("reply 3"),
    ];

    const result = await compact(messages, { ...DEFAULT_COMPACTION_SETTINGS, keepRecentTokens: 10 }, provider);

    expect(result.summary).toContain("## Goal");
    expect(result.retainedTail.length).toBeGreaterThan(0);
    expect(result.tokensBefore).toBeGreaterThan(0);
    expect(result.firstKeptMessageId).toBe(result.retainedTail[0].id);
  });
});
