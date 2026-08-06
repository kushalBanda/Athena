import { describe, it, expect } from "bun:test";
import React from "react";
import { InputBox } from "../src/components/InputBox.js";
import { renderToString, renderInteractive } from "./helpers.js";

const LEFT = "\x1B[D";
const BACKSPACE = "\x7F";

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
});
