import { describe, it, expect } from "bun:test";
import React from "react";
import { StatusBar } from "../src/components/StatusBar.js";
import { renderToString } from "./helpers.js";

describe("StatusBar", () => {
  it("renders model name", async () => {
    const out = await renderToString(
      <StatusBar model="claude-opus-5" cwd="/tmp/project" inputTokens={0} outputTokens={0} />,
    );
    expect(out).toContain("claude-opus-5");
  });

  it("substitutes HOME with ~", async () => {
    const home = process.env.HOME ?? "/Users/test";
    const out = await renderToString(
      <StatusBar model="m" cwd={`${home}/myproject`} inputTokens={0} outputTokens={0} />,
    );
    expect(out).toContain("~/myproject");
    expect(out).not.toContain(home + "/myproject");
  });

  it("leaves non-home cwd unchanged", async () => {
    const out = await renderToString(
      <StatusBar model="m" cwd="/var/log" inputTokens={0} outputTokens={0} />,
    );
    expect(out).toContain("/var/log");
  });

  it("sums input and output tokens", async () => {
    const out = await renderToString(
      <StatusBar model="m" cwd="/tmp" inputTokens={1200} outputTokens={800} />,
    );
    expect(out).toContain("2,000 tok");
  });

  it("shows athena symbol α", async () => {
    const out = await renderToString(
      <StatusBar model="m" cwd="/tmp" inputTokens={0} outputTokens={0} />,
    );
    expect(out).toContain("α");
  });
});
