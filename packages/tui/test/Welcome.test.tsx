import { describe, expect, it } from "bun:test";
import { Welcome } from "../src/components/Welcome.js";
import { renderToString } from "./helpers.js";

describe("Welcome", () => {
  it("renders the cwd", async () => {
    const out = await renderToString(<Welcome cwd="/tmp/project" />);
    expect(out).toContain("/tmp/project");
  });

  it("substitutes HOME with ~", async () => {
    const home = process.env.HOME ?? "/Users/test";
    const out = await renderToString(<Welcome cwd={`${home}/myproject`} />);
    expect(out).toContain("~/myproject");
  });

  it("renders the welcome heading and tips", async () => {
    const out = await renderToString(<Welcome cwd="/tmp" />);
    expect(out).toContain("Welcome to Athena");
    expect(out).toContain("Tips for getting started");
  });
});
