import { describe, it, expect } from "bun:test";
import React from "react";
import { InputBox } from "../src/components/InputBox.js";
import { renderToString, renderInteractive } from "./helpers.js";

const LEFT = "\x1B[D";
const UP = "\x1B[A";
const BACKSPACE = "\x7F";
const ALT_BACKSPACE = "\x1B\x7F";
const CTRL_W = "\x17";
const ENTER = "\r";

describe("InputBox", () => {
  it("shows ▸ prompt prefix", async () => {
    const out = await renderToString(<InputBox onSubmit={() => {}} />);
    expect(out).toContain("▸");
  });

  it("shows block cursor █ when active", async () => {
    const out = await renderToString(<InputBox onSubmit={() => {}} disabled={false} />);
    expect(out).toContain("█");
  });

  it("hides block cursor when disabled", async () => {
    const out = await renderToString(<InputBox onSubmit={() => {}} disabled={true} />);
    expect(out).not.toContain("█");
  });

  it("inserts typed text at the cursor position, not just at the end", async () => {
    const handle = renderInteractive(<InputBox onSubmit={() => {}} />);
    await handle.type("ac");
    await handle.type(LEFT);
    await handle.type("b");
    expect(handle.frame().replace("█", "")).toContain("abc");
    handle.unmount();
  });

  it("backspace removes the char before the cursor, not always the last char", async () => {
    const handle = renderInteractive(<InputBox onSubmit={() => {}} />);
    await handle.type("abc");
    await handle.type(LEFT);
    await handle.type(BACKSPACE);
    const stripped = handle.frame().replace("█", "");
    expect(stripped).toContain("ac");
    expect(stripped).not.toContain("abc");
    handle.unmount();
  });

  it("shows @ mention suggestions ranked against typed query", async () => {
    const handle = renderInteractive(
      <InputBox onSubmit={() => {}} mentionCandidates={["src/index.ts", "src/components/InputBox.tsx", "README.md"]} />,
    );
    await handle.type("@Input");
    expect(handle.frame()).toContain("src/components/InputBox.tsx");
    expect(handle.frame()).not.toContain("README.md");
    handle.unmount();
  });

  it("Tab completes the highlighted @ mention into the input", async () => {
    const handle = renderInteractive(
      <InputBox onSubmit={() => {}} mentionCandidates={["src/index.ts", "src/components/InputBox.tsx"]} />,
    );
    await handle.type("@Input");
    await handle.type("\t");
    expect(handle.frame()).toContain("@src/components/InputBox.tsx");
    handle.unmount();
  });

  it("does not trigger @ mention mid-word (no whitespace before @)", async () => {
    const handle = renderInteractive(
      <InputBox onSubmit={() => {}} mentionCandidates={["src/index.ts"]} />,
    );
    await handle.type("foo@bar");
    expect(handle.frame()).not.toContain("src/index.ts");
    handle.unmount();
  });

  it("still supports existing slash-command suggestions", async () => {
    const handle = renderInteractive(<InputBox onSubmit={() => {}} />);
    await handle.type("/mod");
    expect(handle.frame()).toContain("/model");
    handle.unmount();
  });

  it("Enter applies the highlighted slash suggestion instead of submitting", async () => {
    const submitted: string[] = [];
    const handle = renderInteractive(<InputBox onSubmit={(v) => submitted.push(v)} />);
    await handle.type("/mod");
    await handle.type(ENTER);
    expect(handle.frame().replace("█", "")).toContain("/model ");
    expect(submitted).toEqual([]);
    handle.unmount();
  });

  it("Enter applies the highlighted @ mention suggestion instead of submitting", async () => {
    const submitted: string[] = [];
    const handle = renderInteractive(
      <InputBox onSubmit={(v) => submitted.push(v)} mentionCandidates={["src/components/InputBox.tsx"]} />,
    );
    await handle.type("@Input");
    await handle.type(ENTER);
    expect(handle.frame()).toContain("@src/components/InputBox.tsx");
    expect(submitted).toEqual([]);
    handle.unmount();
  });

  it("shows queued messages and lets ↑ on an empty input recall the last one", async () => {
    let recalled = 0;
    const handle = renderInteractive(
      <InputBox onSubmit={() => {}} queuedMessages={["first", "second"]} onRecallQueued={() => recalled++} />,
    );
    expect(handle.frame()).toContain("2 queued");
    expect(handle.frame()).toContain("first");
    expect(handle.frame()).toContain("second");

    await handle.type(UP);
    const stripped = handle.frame().replace("█", "");
    expect(stripped).toContain("second");
    expect(recalled).toBe(1);
    handle.unmount();
  });

  it("does not recall a queued message when the input already has text", async () => {
    let recalled = 0;
    const handle = renderInteractive(
      <InputBox onSubmit={() => {}} queuedMessages={["queued"]} onRecallQueued={() => recalled++} />,
    );
    await handle.type("typing");
    await handle.type(UP);
    expect(recalled).toBe(0);
    handle.unmount();
  });

  it("alt+backspace deletes the word before the cursor", async () => {
    const handle = renderInteractive(<InputBox onSubmit={() => {}} />);
    await handle.type("foo bar");
    await handle.type(ALT_BACKSPACE);
    const stripped = handle.frame().replace("█", "");
    expect(stripped).toContain("foo ");
    expect(stripped).not.toContain("bar");
    handle.unmount();
  });

  it("ctrl+w deletes the word before the cursor", async () => {
    const handle = renderInteractive(<InputBox onSubmit={() => {}} />);
    await handle.type("foo bar");
    await handle.type(CTRL_W);
    const stripped = handle.frame().replace("█", "");
    expect(stripped).toContain("foo ");
    expect(stripped).not.toContain("bar");
    handle.unmount();
  });

  it("word-backward delete only removes the word left of the cursor, not the whole line", async () => {
    const handle = renderInteractive(<InputBox onSubmit={() => {}} />);
    await handle.type("foo bar baz");
    await handle.type(LEFT);
    await handle.type(LEFT);
    await handle.type(LEFT); // cursor right before "baz"
    await handle.type(CTRL_W);
    const stripped = handle.frame().replace("█", "");
    expect(stripped).toContain("foo baz");
    handle.unmount();
  });
});
