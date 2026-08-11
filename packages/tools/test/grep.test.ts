import { describe, expect, it, beforeAll, afterAll } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { GrepTool } from "../src/impl/grep.js";
import type { ToolContext } from "../src/types.js";

const tmpDir = "/tmp/athena-tools-grep-test";
const ctx: ToolContext = { workingDir: tmpDir };
const tool = new GrepTool();

beforeAll(() => {
  mkdirSync(tmpDir, { recursive: true });
  writeFileSync(`${tmpDir}/a.ts`, 'export function hello() { return "world"; }');
  writeFileSync(`${tmpDir}/b.ts`, "export function greet(name: string) { return `hi ${name}`; }");
  writeFileSync(`${tmpDir}/c.txt`, "not typescript");
});

afterAll(() => rmSync(tmpDir, { recursive: true, force: true }));

describe("GrepTool", () => {
  it("finds pattern in files", async () => {
    const r = await tool.execute({ pattern: "hello", path: tmpDir }, ctx);
    expect(r.isError).toBe(false);
    expect(r.content).toContain("hello");
  });

  it("returns no matches when pattern absent", async () => {
    const r = await tool.execute({ pattern: "ZZZNOMATCH", path: tmpDir }, ctx);
    expect(r.isError).toBe(false);
    expect(r.content).toContain("No matches");
  });

  it("filters by glob", async () => {
    const r = await tool.execute({ pattern: "typescript", path: tmpDir, glob: "*.ts" }, ctx);
    expect(r.isError).toBe(false);
    expect(r.content).toContain("No matches");
  });

  it("case-insensitive search", async () => {
    const r = await tool.execute({ pattern: "HELLO", path: tmpDir, ignoreCase: true }, ctx);
    expect(r.isError).toBe(false);
    expect(r.content).toContain("hello");
  });

  it("respects maxResults", async () => {
    const many = Array.from({ length: 50 }, (_, i) => `line${i}: match`).join("\n");
    writeFileSync(`${tmpDir}/many.txt`, many);
    const r = await tool.execute({ pattern: "match", path: tmpDir, maxResults: 5 }, ctx);
    expect(r.isError).toBe(false);
    const lineCount = r.content.split("\n").filter((l) => l.includes("match")).length;
    expect(lineCount).toBeLessThanOrEqual(5);
  });
});
