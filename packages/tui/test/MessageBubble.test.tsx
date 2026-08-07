import { describe, it, expect } from "bun:test";
import React from "react";
import { MessageBubble } from "../src/components/MessageBubble.js";
import { renderToString } from "./helpers.js";
import type { Message } from "../src/types.js";

function msg(overrides: Partial<Message>): Message {
  return { id: "1", role: "user", ...overrides };
}

describe("MessageBubble", () => {
  it("marks user messages with '>'", async () => {
    const out = await renderToString(<MessageBubble message={msg({ role: "user", content: "hello" })} />);
    expect(out).toContain("> hello");
  });

  it("marks assistant messages with '●'", async () => {
    const out = await renderToString(<MessageBubble message={msg({ role: "assistant", content: "hi" })} />);
    expect(out).toContain("● hi");
  });

  it("renders a standalone timing line", async () => {
    const out = await renderToString(<MessageBubble message={msg({ role: "timing", content: "Crunched for 3s" })} />);
    expect(out).toContain("* Crunched for 3s");
  });

  it("renders message content", async () => {
    const out = await renderToString(<MessageBubble message={msg({ role: "user", content: "fix the bug" })} />);
    expect(out).toContain("fix the bug");
  });

  it("renders tool calls under assistant message", async () => {
    const out = await renderToString(
      <MessageBubble
        message={msg({
          role: "assistant",
          toolCalls: [{ id: "t1", name: "shell_exec", args: "echo hi", status: "ok" }],
        })}
      />,
    );
    expect(out).toContain("shell_exec");
    expect(out).toContain("OK");
  });

  it("shows thinking spinner when streaming with no content", async () => {
    const out = await renderToString(
      <MessageBubble message={msg({ role: "assistant", streaming: true })} />,
      150,
    );
    expect(out).toContain("thinking");
  });

  it("does not show thinking spinner when content exists", async () => {
    const out = await renderToString(
      <MessageBubble message={msg({ role: "assistant", content: "done", streaming: true })} />,
    );
    expect(out).not.toContain("thinking");
  });
});
