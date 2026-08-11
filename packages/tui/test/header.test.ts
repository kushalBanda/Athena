import assert from "node:assert";
import { describe, it } from "node:test";
import { stripVTControlCharacters } from "node:util";
import { getGitInfo, Header } from "../src/components/header.ts";

describe("getGitInfo", () => {
  it("returns the current branch name for this repo", () => {
    const info = getGitInfo(process.cwd());
    assert.ok(info !== null);
    assert.strictEqual(typeof info.branch, "string");
    assert.ok(info.branch.length > 0);
  });

  it("returns null for a non-git directory", () => {
    const info = getGitInfo("/tmp");
    assert.strictEqual(info, null);
  });
});

describe("Header", () => {
  it("renders the cwd", () => {
    const header = new Header("/tmp");
    const line = stripVTControlCharacters(header.render(80).join("\n"));
    assert.ok(line.includes("/tmp"));
  });

  it("renders the git branch when cwd is a git repo", () => {
    const header = new Header(process.cwd());
    const info = getGitInfo(process.cwd());
    const line = stripVTControlCharacters(header.render(200).join("\n"));
    if (info) assert.ok(line.includes(info.branch));
  });
});
