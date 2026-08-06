import { describe, expect, it } from "bun:test";
import { rankMentionCandidates } from "../src/lib/mention-autocomplete.js";

describe("rankMentionCandidates", () => {
  const paths = [
    "src/index.ts",
    "src/components/InputBox.tsx",
    "src/components/ToolCallBlock.tsx",
    "package.json",
    "README.md",
  ];

  it("ranks exact/prefix matches above weaker substring matches", () => {
    const results = rankMentionCandidates(paths, "index");
    expect(results[0]).toBe("src/index.ts");
  });

  it("matches on path segments, not just basename", () => {
    const results = rankMentionCandidates(paths, "components/Input");
    expect(results).toContain("src/components/InputBox.tsx");
  });

  it("returns empty array when nothing matches", () => {
    const results = rankMentionCandidates(paths, "zzzznonexistent");
    expect(results).toEqual([]);
  });

  it("returns all candidates in original relevance order for empty query", () => {
    const results = rankMentionCandidates(paths, "");
    expect(results.length).toBe(paths.length);
  });

  it("respects a limit", () => {
    const many = Array.from({ length: 30 }, (_, i) => `file${i}.ts`);
    const results = rankMentionCandidates(many, "file", 10);
    expect(results.length).toBe(10);
  });
});
