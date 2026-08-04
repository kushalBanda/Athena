import { describe, it, expect } from "bun:test";
import React from "react";
import { ToolCallBlock } from "../src/components/ToolCallBlock.js";
import { renderToString } from "./helpers.js";
import type { ToolCall } from "../src/types.js";

function makeToolCall(overrides: Partial<ToolCall> = {}): ToolCall {
  return { id: "1", name: "read_file", args: "src/index.ts", status: "ok", ...overrides };
}

describe("ToolCallBlock", () => {
  it("renders tool name", async () => {
    const out = await renderToString(<ToolCallBlock toolCall={makeToolCall({ name: "grep" })} />);
    expect(out).toContain("grep");
  });

  it("shows OK badge on success", async () => {
    const out = await renderToString(<ToolCallBlock toolCall={makeToolCall({ status: "ok" })} />);
    expect(out).toContain("OK");
  });

  it("shows ERR badge on error", async () => {
    const out = await renderToString(<ToolCallBlock toolCall={makeToolCall({ status: "err" })} />);
    expect(out).toContain("ERR");
  });

  it("shows … badge while pending", async () => {
    const out = await renderToString(<ToolCallBlock toolCall={makeToolCall({ status: "pending" })} />);
    expect(out).toContain("…");
  });

  it("truncates args longer than 40 chars", async () => {
    const longArgs = "a".repeat(50);
    const out = await renderToString(<ToolCallBlock toolCall={makeToolCall({ args: longArgs, summary: undefined })} />);
    expect(out).not.toContain(longArgs);
    expect(out).toContain("…");
  });

  it("prefers summary over args", async () => {
    const out = await renderToString(
      <ToolCallBlock toolCall={makeToolCall({ args: "raw-args", summary: "12 lines matched" })} />,
    );
    expect(out).toContain("12 lines matched");
    expect(out).not.toContain("raw-args");
  });

  it("renders gutter bar │", async () => {
    const out = await renderToString(<ToolCallBlock toolCall={makeToolCall()} />);
    expect(out).toContain("│");
  });
});
