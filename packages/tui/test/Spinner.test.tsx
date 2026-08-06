import { describe, it, expect } from "bun:test";
import React from "react";
import { Spinner } from "../src/components/Spinner.js";
import { renderToString } from "./helpers.js";

const FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

describe("Spinner", () => {
  it("renders one of the braille frames", async () => {
    const out = await renderToString(<Spinner />);
    expect(FRAMES.some((f) => out.includes(f))).toBe(true);
  });

  it("accepts a custom color without throwing", async () => {
    const out = await renderToString(<Spinner color="#FF0000" />);
    expect(FRAMES.some((f) => out.includes(f))).toBe(true);
  });
});
