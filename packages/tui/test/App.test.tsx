import { describe, it, expect } from "bun:test";
import React from "react";
import { App } from "../src/App.js";
import { renderToString } from "./helpers.js";

describe("App status wiring", () => {
  it("defaults to showing the model badge, no status-bar ctrl+c hint, and a visible input cursor", async () => {
    const out = await renderToString(<App initialState={{ model: "claude-opus-5" }} />);
    expect(out).toContain("claude-opus-5");
    // Welcome's static tips text still legitimately mentions ctrl+c (cancelling a turn);
    // what's gone is the StatusBar's old always-on "ctrl+c exit" hint for the idle state.
    expect(out).not.toContain("ctrl+c exit");
    expect(out).toContain("█");
  });

  it("shows the 'press again to exit' hint only once ctrlCArmed is set", async () => {
    const out = await renderToString(<App initialState={{ ctrlCArmed: true }} />);
    expect(out).toContain("Press Ctrl-C again to exit");
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
    expect(out).toContain("ctx:50%");
    expect(out).toContain("50,000 ↑");
    expect(out).toContain("100,000/200,000");
    expect(out).toContain("$1.50");
  });
});
