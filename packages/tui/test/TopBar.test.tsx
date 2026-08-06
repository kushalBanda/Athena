import { describe, it, expect } from "bun:test";
import React from "react";
import { TopBar } from "../src/components/TopBar.js";
import { renderToString } from "./helpers.js";

describe("TopBar", () => {
  it("substitutes HOME with ~", async () => {
    const home = process.env.HOME ?? "/Users/test";
    const out = await renderToString(<TopBar cwd={`${home}/myproject`} git={null} />);
    expect(out).toContain("~/myproject");
  });

  it("leaves non-home cwd unchanged", async () => {
    const out = await renderToString(<TopBar cwd="/var/log" git={null} />);
    expect(out).toContain("/var/log");
  });

  it("renders a clock", async () => {
    const out = await renderToString(<TopBar cwd="/tmp" git={null} />);
    expect(out).toMatch(/\d{1,2}:\d{2}:\d{2}/);
  });

  it("renders the branch and diffstat when git info is given", async () => {
    const out = await renderToString(
      <TopBar cwd="/tmp" git={{ branch: "main", added: 12, removed: 3 }} />,
    );
    expect(out).toContain("main");
    expect(out).toContain("+12");
    expect(out).toContain("-3");
  });

  it("omits added/removed counts that are zero", async () => {
    const out = await renderToString(
      <TopBar cwd="/tmp" git={{ branch: "main", added: 0, removed: 0 }} />,
    );
    expect(out).toContain("main");
    expect(out).not.toContain("+0");
    expect(out).not.toContain("-0");
  });
});
