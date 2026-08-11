import assert from "node:assert";
import { describe, it } from "node:test";
import { stripVTControlCharacters } from "node:util";
import { Welcome } from "../src/components/welcome.ts";

describe("Welcome", () => {
  it("renders non-empty banner lines including the cwd and a tip", () => {
    const welcome = new Welcome("/tmp/project");
    const lines = welcome.render(80).map(stripVTControlCharacters);
    assert.ok(lines.length > 0);
    assert.ok(lines.some((l) => l.includes("Welcome to Athena")));
    assert.ok(lines.some((l) => l.includes("/tmp/project")));
    assert.ok(lines.some((l) => l.includes("/model")));
  });
});
