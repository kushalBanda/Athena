import assert from "node:assert";
import { describe, it } from "node:test";
import { stripVTControlCharacters } from "node:util";
import { readFileSync } from "node:fs";
import { StatusBar, type StatusBarState } from "../src/components/status-bar.ts";

const baseState: StatusBarState = {
  model: "claude-sonnet-5",
  effort: undefined,
  inputTokens: 100,
  outputTokens: 50,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
  cwd: "/tmp/project",
  status: { kind: "ready" },
};

describe("StatusBar", () => {
  it("renders without throwing and without a cost figure when costUsd is unset", () => {
    const bar = new StatusBar(baseState);
    const line = stripVTControlCharacters(bar.render(80).join("\n"));
    assert.ok(line.includes("claude-sonnet-5"));
    assert.ok(!line.includes("$"));
  });

  it("renders the cost figure once costUsd is supplied", () => {
    const bar = new StatusBar({ ...baseState, costUsd: 0.0042 });
    const line = stripVTControlCharacters(bar.render(80).join("\n"));
    assert.ok(line.includes("$0.0042"));
  });

  it("renders the retrying status with attempt and reason", () => {
    const bar = new StatusBar({
      ...baseState,
      status: {
        kind: "retrying",
        attempt: 2,
        maxAttempts: 3,
        delayMs: 4000,
        reason: "rate limited",
      },
    });
    const line = stripVTControlCharacters(bar.render(80).join("\n"));
    assert.ok(line.includes("RETRYING"));
    assert.ok(line.includes("rate limited"));
  });

  it("renders cache token counts and cwd", () => {
    const bar = new StatusBar({ ...baseState, cacheReadTokens: 12000, cacheWriteTokens: 500 });
    const line = stripVTControlCharacters(bar.render(80).join("\n"));
    assert.ok(line.includes("cache 12.0kr/500w"));
    assert.ok(line.includes("/tmp/project"));
  });

  it("never imports @athena/providers (regression guard for the drift fix)", () => {
    const src = readFileSync(new URL("../src/components/status-bar.ts", import.meta.url), "utf-8");
    assert.ok(!/^import .*@athena\/providers/m.test(src));
  });
});
