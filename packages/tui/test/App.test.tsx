import { describe, it, expect } from "bun:test";
import React from "react";
import { App } from "../src/App.js";
import { renderToString } from "./helpers.js";

describe("App status wiring", () => {
  it("defaults to READY with the exit hint and a visible input cursor", async () => {
    const out = await renderToString(<App />);
    expect(out).toContain("READY");
    expect(out).toContain("ctrl+c exit");
    expect(out).toContain("█");
  });

  it("a busy initialState.status hides the input cursor and shows the tool badge", async () => {
    const out = await renderToString(<App initialState={{ status: { kind: "tool", name: "grep" } }} />);
    expect(out).toContain("TOOL: grep");
    expect(out).not.toContain("█");
  });

  it("renders contextLimit as a percentage and costUsd from initialState", async () => {
    const out = await renderToString(
      <App
        initialState={{
          inputTokens: 50_000,
          outputTokens: 50_000,
          contextLimit: 200_000,
          costUsd: 1.5,
        }}
      />,
    );
    expect(out).toContain("100,000 tok (50%)");
    expect(out).toContain("$1.50");
  });
});
