import { describe, expect, it, beforeAll, afterAll } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { ListDirectoryTool } from "../src/impl/list-directory.js";
import type { ToolContext } from "../src/types.js";

const tmpDir = "/tmp/athena-tools-ls-test";
const ctx: ToolContext = { workingDir: tmpDir };
const tool = new ListDirectoryTool();

beforeAll(() => {
  mkdirSync(`${tmpDir}/subdir`, { recursive: true });
  writeFileSync(`${tmpDir}/foo.ts`, "");
  writeFileSync(`${tmpDir}/bar.ts`, "");
  writeFileSync(`${tmpDir}/subdir/baz.ts`, "");
});

afterAll(() => rmSync(tmpDir, { recursive: true, force: true }));

describe("ListDirectoryTool", () => {
  it("lists entries in a directory", async () => {
    const r = await tool.execute({ path: tmpDir }, ctx);
    expect(r.isError).toBe(false);
    expect(r.content).toContain("foo.ts");
    expect(r.content).toContain("bar.ts");
    expect(r.content).toContain("subdir");
  });

  it("returns error for missing directory", async () => {
    const r = await tool.execute({ path: "/tmp/athena-no-such-dir-xyz" }, ctx);
    expect(r.isError).toBe(true);
  });
});
