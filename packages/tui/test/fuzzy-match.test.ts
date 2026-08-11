import { describe, expect, it } from "bun:test";
import { fuzzyMatch } from "../src/lib/fuzzy-match.js";

describe("fuzzyMatch", () => {
  it("matches everything with score 0 and no indices for an empty query", () => {
    expect(fuzzyMatch("", "anything")).toEqual({ score: 0, indices: [] });
  });

  it("returns null when the query isn't a subsequence of the target", () => {
    expect(fuzzyMatch("xyz", "model")).toBeNull();
  });

  it("is case-insensitive", () => {
    expect(fuzzyMatch("MOD", "model")).not.toBeNull();
    expect(fuzzyMatch("mod", "MODEL")).not.toBeNull();
  });

  it("finds a contiguous substring match with indices pointing at it", () => {
    const result = fuzzyMatch("con", "context-config");
    expect(result).not.toBeNull();
    expect(result?.indices).toEqual([0, 1, 2]);
  });

  it("finds a scattered subsequence match", () => {
    const result = fuzzyMatch("ccf", "context-config");
    expect(result).not.toBeNull();
    expect(result?.indices).toEqual([0, 8, 11]);
  });

  it("scores a contiguous substring match higher than a scattered one", () => {
    const substring = fuzzyMatch("con", "context-config");
    const scattered = fuzzyMatch("ccg", "context-config");
    expect(substring).not.toBeNull();
    expect(scattered).not.toBeNull();
    expect(substring!.score).toBeGreaterThan(scattered!.score);
  });

  it("scores a match starting at position 0 higher than the same query starting later", () => {
    const atStart = fuzzyMatch("mod", "model-picker");
    const later = fuzzyMatch("mod", "the-model-picker");
    expect(atStart).not.toBeNull();
    expect(later).not.toBeNull();
    expect(atStart!.score).toBeGreaterThan(later!.score);
  });

  it("gives a boundary bonus to a match starting right after a separator", () => {
    const afterBoundary = fuzzyMatch("con", "claude-context-config");
    const midWord = fuzzyMatch("ont", "claude-context-config");
    expect(afterBoundary).not.toBeNull();
    expect(midWord).not.toBeNull();
    expect(afterBoundary!.score).toBeGreaterThan(midWord!.score);
  });

  it("penalizes a wider span between first and last match", () => {
    const tight = fuzzyMatch("ab", "ab-far-away-xyz");
    const wide = fuzzyMatch("az", "ab-far-away-xyz");
    expect(tight).not.toBeNull();
    expect(wide).not.toBeNull();
    expect(tight!.score).toBeGreaterThan(wide!.score);
  });
});
