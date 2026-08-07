import { describe, it, expect } from "bun:test";
import React from "react";
import { Text } from "ink";
import { ChatView } from "../src/components/ChatView.js";
import { renderToString } from "./helpers.js";
import type { Message } from "../src/types.js";

const msgs: Message[] = [
  { id: "1", role: "user", content: "what is 2+2?" },
  { id: "2", role: "assistant", content: "4" },
];

const header = <Text>my-header</Text>;

describe("ChatView", () => {
  it("renders all messages", async () => {
    const out = await renderToString(<ChatView header={header} messages={msgs} thinking={false} />);
    expect(out).toContain("what is 2+2?");
    expect(out).toContain("4");
  });

  it("shows thinking spinner when thinking=true and no messages", async () => {
    const out = await renderToString(<ChatView header={header} messages={[]} thinking={true} />, 150);
    expect(out).toContain("thinking");
  });

  it("does not show thinking spinner when thinking=false", async () => {
    const out = await renderToString(<ChatView header={header} messages={[]} thinking={false} />);
    expect(out).not.toContain("thinking");
  });

  it("renders messages in order", async () => {
    const out = await renderToString(<ChatView header={header} messages={msgs} thinking={false} />);
    const userIdx = out.indexOf("what is 2+2?");
    const assistantIdx = out.indexOf("● 4");
    expect(userIdx).toBeGreaterThanOrEqual(0);
    expect(userIdx).toBeLessThan(assistantIdx);
  });

  it("renders the header above the messages", async () => {
    const out = await renderToString(<ChatView header={header} messages={msgs} thinking={false} />);
    const headerIdx = out.indexOf("my-header");
    const firstMsgIdx = out.indexOf("what is 2+2?");
    expect(headerIdx).toBeGreaterThanOrEqual(0);
    expect(headerIdx).toBeLessThan(firstMsgIdx);
  });

  it("keeps the header visible when there are no messages yet", async () => {
    const out = await renderToString(<ChatView header={header} messages={[]} thinking={false} />);
    expect(out).toContain("my-header");
  });
});
