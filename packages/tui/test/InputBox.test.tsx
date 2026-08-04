import { describe, it, expect } from "bun:test";
import React from "react";
import { InputBox } from "../src/components/InputBox.js";
import { renderToString } from "./helpers.js";

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
});
