import { describe, it, expect } from "bun:test";
import React from "react";
import { StatusBar } from "../src/components/StatusBar.js";
import { renderToString, renderToStringAtWidth } from "./helpers.js";
import type { AgentStatus } from "../src/types.js";

const READY: AgentStatus = { kind: "ready" };

describe("StatusBar", () => {
  it("renders cwd", async () => {
    const out = await renderToString(
      <StatusBar model="claude-opus-5" cwd="/tmp/project" inputTokens={0} outputTokens={0} status={READY} />,
    );
    expect(out).toContain("/tmp/project");
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

  it("shows input and output tokens separately", async () => {
    const out = await renderToString(
      <StatusBar model="m" cwd="/tmp" inputTokens={1200} outputTokens={800} status={READY} />,
    );
    expect(out).toContain("1,200 ↑");
    expect(out).toContain("800 ↓");
  });

  it("shows the model name as the badge and no ctrl+c hint when idle", async () => {
    const out = await renderToString(
      <StatusBar model="claude-sonnet-5" cwd="/tmp" inputTokens={0} outputTokens={0} status={READY} />,
    );
    expect(out).toContain("claude-sonnet-5");
    expect(out).not.toContain("ctrl+c");
  });

  it("shows the 'press again to exit' hint only when ctrlCArmed", async () => {
    const notArmed = await renderToString(
      <StatusBar model="m" cwd="/tmp" inputTokens={0} outputTokens={0} status={READY} ctrlCArmed={false} />,
    );
    expect(notArmed).not.toContain("Press Ctrl-C again");

    const armed = await renderToString(
      <StatusBar model="m" cwd="/tmp" inputTokens={0} outputTokens={0} status={READY} ctrlCArmed={true} />,
    );
    expect(armed).toContain("Press Ctrl-C again to exit");
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
    expect(out).toContain("50,000 ↑ (50%)");
    expect(out).toContain("100,000/200,000");
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

  it("wraps onto multiple lines instead of dropping content on a narrow terminal", async () => {
    // Regression: the row previously had no flexWrap, so on a terminal narrow enough
    // that the badge+hint alone filled the available width, Yoga computed zero width
    // for every segment after the flexGrow spacer — tokens/cost/cwd all silently
    // vanished rather than wrapping or truncating.
    const out = await renderToStringAtWidth(
      <StatusBar
        model="claude-sonnet-5"
        cwd="/Users/test/some/deep/project/path"
        inputTokens={1234}
        outputTokens={567}
        status={READY}
        contextLimit={200_000}
      />,
      30,
    );
    expect(out).toContain("claude-sonnet-5");
    expect(out).toContain("1,234");
  });
});
