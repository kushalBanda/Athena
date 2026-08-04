import { describe, expect, it, beforeAll, afterAll } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { FindTool } from "../src/impl/find.js";
import type { ToolContext } from "../src/types.js";

const tmpDir = "/tmp/athena-tools-find-test";
const ctx: ToolContext = { workingDir: tmpDir };
const tool = new FindTool();

beforeAll(() => {
  mkdirSync(`${tmpDir}/sub`, { recursive: true });
  writeFileSync(`${tmpDir}/index.ts`, "");
  writeFileSync(`${tmpDir}/config.json`, "{}");
  writeFileSync(`${tmpDir}/sub/util.ts`, "");
});

afterAll(() => rmSync(tmpDir, { recursive: true, force: true }));

describe("FindTool", () => {
  it("finds files by pattern", async () => {
    const r = await tool.execute({ pattern: "*.ts", path: tmpDir }, ctx);
    expect(r.isError).toBe(false);
    expect(r.content).toContain("index.ts");
    expect(r.content).toContain("util.ts");
  });

  it("does not return non-matching files", async () => {
    const r = await tool.execute({ pattern: "*.ts", path: tmpDir }, ctx);
    expect(r.content).not.toContain("config.json");
  });

  it("finds directories with type=d", async () => {
    const r = await tool.execute({ pattern: "sub", path: tmpDir, type: "d" }, ctx);
    expect(r.isError).toBe(false);
    expect(r.content).toContain("sub");
  });

  it("returns no matches for absent pattern", async () => {
    const r = await tool.execute({ pattern: "*.zig", path: tmpDir }, ctx);
    expect(r.isError).toBe(false);
    expect(r.content).toContain("No matches");
  });
});
