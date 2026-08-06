import { describe, expect, it } from "bun:test";
import { estimateCost } from "../src/pricing.js";

describe("estimateCost", () => {
  it("returns undefined for an unknown model", () => {
    expect(estimateCost("some-random-local-model", 1000, 1000)).toBeUndefined();
  });

  it("computes cost for a known model from its $/M-token rates", () => {
    const cost = estimateCost("claude-sonnet-5", 1_000_000, 1_000_000);
    expect(cost).toBeCloseTo(3 + 15, 5);
  });

  it("matches by substring regardless of provider prefix or date suffix", () => {
    const cost = estimateCost("anthropic/claude-sonnet-5-20260101", 500_000, 0);
    expect(cost).toBeCloseTo(1.5, 5);
  });

  it("scales linearly with token count", () => {
    const cost = estimateCost("claude-haiku-4-5", 2_000_000, 0);
    expect(cost).toBeCloseTo(1.6, 5);
  });

  it("returns 0 for a known model with 0 tokens", () => {
    expect(estimateCost("claude-opus-5", 0, 0)).toBe(0);
  });
});
