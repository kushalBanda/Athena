import { describe, it, expect } from "bun:test";
import React from "react";
import { ChatView } from "../src/components/ChatView.js";
import { renderToString } from "./helpers.js";
import type { Message } from "../src/types.js";

const msgs: Message[] = [
  { id: "1", role: "user", content: "what is 2+2?" },
  { id: "2", role: "assistant", content: "4" },
];

describe("ChatView", () => {
  it("renders all messages", async () => {
    const out = await renderToString(<ChatView messages={msgs} thinking={false} />);
    expect(out).toContain("what is 2+2?");
    expect(out).toContain("4");
  });

  it("shows thinking spinner when thinking=true and no messages", async () => {
    const out = await renderToString(<ChatView messages={[]} thinking={true} />, 150);
    expect(out).toContain("thinking");
  });

  it("does not show thinking spinner when thinking=false", async () => {
    const out = await renderToString(<ChatView messages={[]} thinking={false} />);
    expect(out).not.toContain("thinking");
  });

  it("renders messages in order", async () => {
    const out = await renderToString(<ChatView messages={msgs} thinking={false} />);
    const youIdx = out.indexOf("you");
    const athenaIdx = out.indexOf("athena");
    expect(youIdx).toBeLessThan(athenaIdx);
  });
});
