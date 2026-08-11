import assert from "node:assert";
import { describe, it } from "node:test";
import { stripVTControlCharacters } from "node:util";
import {
  CompactionStatusIndicator,
  RetryStatusIndicator,
  WorkingStatusIndicator,
} from "../src/components/status-indicator.ts";
import type { TUI } from "../src/tui.ts";

const stubTui = { requestRender() {} } as unknown as TUI;

describe("status indicators", () => {
  it("WorkingStatusIndicator renders a working message", () => {
    const indicator = new WorkingStatusIndicator(stubTui);
    try {
      const lines = indicator.render(80).map(stripVTControlCharacters).join("\n");
      assert.ok(lines.includes("Working…"));
    } finally {
      indicator.stop();
    }
  });

  it("RetryStatusIndicator renders reason, attempt count, and delay", () => {
    const indicator = new RetryStatusIndicator(stubTui, 1, 3, 4000, "rate limited");
    try {
      const lines = indicator.render(80).map(stripVTControlCharacters).join("\n");
      assert.ok(lines.includes("rate limited"));
      assert.ok(lines.includes("1/3"));
      assert.ok(lines.includes("4s"));
    } finally {
      indicator.stop();
    }
  });

  it("CompactionStatusIndicator renders a compacting message", () => {
    const indicator = new CompactionStatusIndicator(stubTui);
    try {
      const lines = indicator.render(80).map(stripVTControlCharacters).join("\n");
      assert.ok(lines.includes("Compacting context…"));
    } finally {
      indicator.stop();
    }
  });
});
