import assert from "node:assert";
import { describe, it } from "node:test";
import { Transcript } from "../src/components/transcript.ts";
import { defaultTheme } from "../src/theme.ts";
import type { TUI } from "../src/tui.ts";
import { defaultMarkdownTheme } from "./test-themes.ts";

const stubTui = { requestRender() {} } as unknown as TUI;

describe("Transcript", () => {
  it("renders a user message on the userMessage background bubble, no role label", () => {
    const t = new Transcript(stubTui, defaultMarkdownTheme, defaultTheme);
    t.appendMessage({ id: "1", role: "user", content: "hello world" });
    const out = t.render(80).join("\n");
    // Role is signaled by the background bubble, not a "You:"/"Athena:" text prefix.
    assert.ok(!out.includes("You:"));
    const bgEscapeStart = defaultTheme.bg.userMessage("X").split("X")[0]!;
    assert.ok(out.includes(bgEscapeStart));
    assert.ok(out.includes("hello world"));
  });

  it("updates a streaming message in place by id", () => {
    const t = new Transcript(stubTui, defaultMarkdownTheme, defaultTheme);
    t.appendMessage({ id: "1", role: "assistant", content: "partial", streaming: true });
    t.updateMessage("1", { content: "partial text done", streaming: false });
    const out = t.render(80).join("\n");
    assert.ok(out.includes("partial text done"));
    assert.ok(!out.includes("partial\n"));
  });

  it("renders a tool call with an error status badge", () => {
    const t = new Transcript(stubTui, defaultMarkdownTheme, defaultTheme);
    t.appendMessage({
      id: "1",
      role: "assistant",
      toolCalls: [{ id: "tc1", name: "grep", args: "{}", status: "err", summary: "no matches" }],
    });
    const out = t.render(80).join("\n");
    assert.ok(out.includes("✗"));
    assert.ok(out.includes("grep"));
    assert.ok(out.includes("no matches"));
  });

  it("caps diff display at 6 lines and notes the remainder", () => {
    const t = new Transcript(stubTui, defaultMarkdownTheme, defaultTheme);
    const diff = Array.from({ length: 10 }, (_, i) => ({
      type: "add" as const,
      text: `line ${i}`,
    }));
    t.appendMessage({
      id: "1",
      role: "assistant",
      toolCalls: [{ id: "tc1", name: "write_file", args: "{}", status: "ok", diff }],
    });
    const out = t.render(80).join("\n");
    assert.ok(out.includes("line 0"));
    assert.ok(out.includes("line 5"));
    assert.ok(!out.includes("line 6"));
    assert.ok(out.includes("4 more lines"));
  });

  it("appends new lines on repeated updateMessage during streaming instead of freezing", () => {
    const t = new Transcript(stubTui, defaultMarkdownTheme, defaultTheme);
    t.appendMessage({ id: "1", role: "assistant", content: "", streaming: true });
    let content = "";
    for (let i = 0; i < 30; i++) {
      content += `line ${i}\n`;
      t.updateMessage("1", { content });
    }
    const out = t.render(80).join("\n");
    assert.ok(out.includes("line 29"));
  });
});
