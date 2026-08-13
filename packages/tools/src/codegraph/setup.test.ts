import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { runCodegraphSetup } from "./setup.js";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "athena-setup-test-"));
  mkdirSync(path.join(dir, ".git")); // make it look like a git repo
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("runCodegraphSetup", () => {
  test("appends .codegraph/ to an existing .gitignore missing the entry", async () => {
    writeFileSync(path.join(dir, ".gitignore"), "node_modules/\n");
    const result = await runCodegraphSetup(dir);
    const gitignore = readFileSync(path.join(dir, ".gitignore"), "utf-8");
    expect(gitignore).toContain(".codegraph/");
    expect(result.gitignoreUpdated).toBe(true);
  });

  test("does not duplicate .codegraph/ entry if already present", async () => {
    writeFileSync(path.join(dir, ".gitignore"), "node_modules/\n.codegraph/\n");
    const result = await runCodegraphSetup(dir);
    const gitignore = readFileSync(path.join(dir, ".gitignore"), "utf-8");
    expect(gitignore.match(/\.codegraph\//g)?.length).toBe(1);
    expect(result.gitignoreUpdated).toBe(false);
  });

  test("skips gitignore write when not a git repo", async () => {
    rmSync(path.join(dir, ".git"), { recursive: true, force: true });
    const result = await runCodegraphSetup(dir);
    expect(existsSync(path.join(dir, ".gitignore"))).toBe(false);
    expect(result.gitignoreUpdated).toBe(false);
  });

  test("never throws when @colbymchenry/codegraph is unresolvable", async () => {
    await expect(runCodegraphSetup(dir)).resolves.toBeDefined();
  });
});
