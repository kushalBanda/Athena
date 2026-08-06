import { describe, it, expect } from "bun:test";
import React from "react";
import { StatusBar } from "../src/components/StatusBar.js";
import { renderToString } from "./helpers.js";
import type { AgentStatus } from "../src/types.js";

const READY: AgentStatus = { kind: "ready" };

describe("StatusBar", () => {
  it("renders model name", async () => {
    const out = await renderToString(
      <StatusBar model="claude-opus-5" cwd="/tmp/project" inputTokens={0} outputTokens={0} status={READY} />,
    );
    expect(out).toContain("claude-opus-5");
  });

  it("substitutes HOME with ~", async () => {
    const home = process.env.HOME ?? "/Users/test";
    const out = await renderToString(
      <StatusBar model="m" cwd={`${home}/myproject`} inputTokens={0} outputTokens={0} status={READY} />,
    );
    expect(out).toContain("~/myproject");
    expect(out).not.toContain(home + "/myproject");
  });

  it("leaves non-home cwd unchanged", async () => {
    const out = await renderToString(
      <StatusBar model="m" cwd="/var/log" inputTokens={0} outputTokens={0} status={READY} />,
    );
    expect(out).toContain("/var/log");
  });

  it("sums input and output tokens", async () => {
    const out = await renderToString(
      <StatusBar model="m" cwd="/tmp" inputTokens={1200} outputTokens={800} status={READY} />,
    );
    expect(out).toContain("2,000 tok");
  });

  it("shows READY badge and exit hint when idle", async () => {
    const out = await renderToString(
      <StatusBar model="m" cwd="/tmp" inputTokens={0} outputTokens={0} status={READY} />,
    );
    expect(out).toContain("READY");
    expect(out).toContain("ctrl+c exit");
  });

  it("shows THINKING badge and cancel hint when busy", async () => {
    const out = await renderToString(
      <StatusBar model="m" cwd="/tmp" inputTokens={0} outputTokens={0} status={{ kind: "thinking" }} />,
    );
    expect(out).toContain("THINKING");
    expect(out).toContain("ctrl+c cancel");
  });

  it("shows the tool name in the TOOL badge", async () => {
    const out = await renderToString(
      <StatusBar
        model="m"
        cwd="/tmp"
        inputTokens={0}
        outputTokens={0}
        status={{ kind: "tool", name: "read_file" }}
      />,
    );
    expect(out).toContain("TOOL: read_file");
  });

  it("shows the COMPACTING badge", async () => {
    const out = await renderToString(
      <StatusBar model="m" cwd="/tmp" inputTokens={0} outputTokens={0} status={{ kind: "compacting" }} />,
    );
    expect(out).toContain("COMPACTING");
  });

  it("shows the ERROR badge with message and no cancel hint", async () => {
    const out = await renderToString(
      <StatusBar
        model="m"
        cwd="/tmp"
        inputTokens={0}
        outputTokens={0}
        status={{ kind: "error", message: "boom" }}
      />,
    );
    expect(out).toContain("ERROR");
    expect(out).toContain("boom");
    expect(out).not.toContain("ctrl+c");
  });

  it("shows context-window percentage when contextLimit is given", async () => {
    const out = await renderToString(
      <StatusBar
        model="m"
        cwd="/tmp"
        inputTokens={50_000}
        outputTokens={50_000}
        status={READY}
        contextLimit={200_000}
      />,
    );
    expect(out).toContain("100,000 tok (50%)");
  });

  it("prefers a real costUsd over the static pricing table", async () => {
    const out = await renderToString(
      <StatusBar
        model="claude-opus-5"
        cwd="/tmp"
        inputTokens={1_000_000}
        outputTokens={0}
        status={READY}
        costUsd={0.0042}
      />,
    );
    expect(out).toContain("$0.0042");
  });

  it("falls back to the static pricing table when costUsd is absent", async () => {
    const out = await renderToString(
      <StatusBar model="claude-sonnet-5" cwd="/tmp" inputTokens={1_000_000} outputTokens={0} status={READY} />,
    );
    expect(out).toContain("$3.00");
  });

  it("hides the cost segment for an unpriced model", async () => {
    const out = await renderToString(
      <StatusBar model="some-local-model" cwd="/tmp" inputTokens={1_000_000} outputTokens={0} status={READY} />,
    );
    expect(out).not.toContain("$");
  });
});
