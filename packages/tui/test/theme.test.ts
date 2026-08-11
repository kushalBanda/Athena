import assert from "node:assert";
import { describe, it } from "node:test";
import { defaultTheme } from "../src/theme.ts";

describe("defaultTheme", () => {
  it("every status token is a callable formatter returning the input text", () => {
    for (const fn of Object.values(defaultTheme.status)) {
      assert.strictEqual(typeof fn, "function");
      assert.ok(fn("hello").includes("hello"));
    }
  });

  it("every text token is a callable formatter returning the input text", () => {
    for (const fn of Object.values(defaultTheme.text)) {
      assert.strictEqual(typeof fn, "function");
      assert.ok(fn("hello").includes("hello"));
    }
  });

  it("border is a callable formatter returning the input text", () => {
    assert.strictEqual(typeof defaultTheme.border, "function");
    assert.ok(defaultTheme.border("hello").includes("hello"));
  });
});
