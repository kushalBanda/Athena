import { describe, expect, it, afterAll } from "bun:test";
import { existsSync, rmSync, readFileSync } from "node:fs";
import { WriteFileTool } from "../src/impl/write-file.js";
import type { ToolContext } from "../src/types.js";

const tmpDir = "/tmp/athena-tools-write-test";
const ctx: ToolContext = { workingDir: tmpDir };
const tool = new WriteFileTool();

afterAll(() => rmSync(tmpDir, { recursive: true, force: true }));

describe("WriteFileTool", () => {
  it("writes a new file", async () => {
    const r = await tool.execute({ path: `${tmpDir}/out.txt`, content: "written" }, ctx);
    expect(r.isError).toBe(false);
    expect(readFileSync(`${tmpDir}/out.txt`, "utf8")).toBe("written");
  });

  it("overwrites existing file", async () => {
    await tool.execute({ path: `${tmpDir}/ow.txt`, content: "first" }, ctx);
    await tool.execute({ path: `${tmpDir}/ow.txt`, content: "second" }, ctx);
    expect(readFileSync(`${tmpDir}/ow.txt`, "utf8")).toBe("second");
  });

  it("creates nested directories", async () => {
    const nested = `${tmpDir}/a/b/c/nested.txt`;
    const r = await tool.execute({ path: nested, content: "deep" }, ctx);
    expect(r.isError).toBe(false);
    expect(existsSync(nested)).toBe(true);
  });

  it("rejects invalid input", async () => {
    const r = await tool.execute({ path: 123 }, ctx);
    expect(r.isError).toBe(true);
  });
});
