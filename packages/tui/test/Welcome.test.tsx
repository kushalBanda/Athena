import { describe, it, expect } from "bun:test";
import React from "react";
import { Welcome } from "../src/components/Welcome.js";
import { renderToString } from "./helpers.js";

describe("Welcome", () => {
  it("renders the model and cwd", async () => {
    const out = await renderToString(<Welcome model="claude-opus-5" cwd="/tmp/project" />);
    expect(out).toContain("claude-opus-5");
    expect(out).toContain("/tmp/project");
  });

  it("substitutes HOME with ~", async () => {
    const home = process.env.HOME ?? "/Users/test";
    const out = await renderToString(<Welcome model="m" cwd={`${home}/myproject`} />);
    expect(out).toContain("~/myproject");
  });

  it("renders the welcome heading and tips", async () => {
    const out = await renderToString(<Welcome model="m" cwd="/tmp" />);
    expect(out).toContain("Welcome to Athena");
    expect(out).toContain("Tips for getting started");
  });
});
