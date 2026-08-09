import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { ReadFileTool } from "../src/impl/read-file.js";
import type { ToolContext } from "../src/types.js";

const tmpDir = "/tmp/athena-tools-read-test";
const ctx: ToolContext = { workingDir: tmpDir };
const tool = new ReadFileTool();
const fixturesDir = path.resolve(import.meta.dir, "../../../docs/resources/anydoc/tests/fixtures");

beforeAll(() => {
  mkdirSync(tmpDir, { recursive: true });
  writeFileSync(`${tmpDir}/hello.txt`, "hello world");
  writeFileSync(`${tmpDir}/big.txt`, "x".repeat(300_000));
});

afterAll(() => rmSync(tmpDir, { recursive: true, force: true }));

describe("ReadFileTool", () => {
  it("reads a file", async () => {
    const r = await tool.execute({ path: "hello.txt" }, ctx);
    expect(r.isError).toBe(false);
    expect(r.content).toBe("hello world");
  });

  it("returns error for missing file", async () => {
    const r = await tool.execute({ path: "nope.txt" }, ctx);
    expect(r.isError).toBe(true);
    expect(r.content).toContain("not found");
  });

  it("truncates large files", async () => {
    const r = await tool.execute({ path: "big.txt", maxBytes: 1000 }, ctx);
    expect(r.isError).toBe(false);
    expect(r.content).toContain("truncated");
    expect(r.content.length).toBeLessThan(310_000);
  });

  it("rejects invalid input schema", async () => {
    const r = await tool.execute({}, ctx);
    expect(r.isError).toBe(true);
    expect(r.content).toContain("Invalid input");
  });

  it("converts a docx file to markdown via anydoc", async () => {
    const r = await tool.execute({ path: `${fixturesDir}/docx/handmade-blockstyle.docx` }, ctx);
    expect(r.isError).toBe(false);
    expect(r.content).toContain("Body before.");
  });

  it("converts a pdf file to markdown via anydoc", async () => {
    const r = await tool.execute({ path: `${fixturesDir}/pdf/text.pdf` }, ctx);
    expect(r.isError).toBe(false);
    expect(r.content).toContain("# Fixture Document");
  });

  it("falls back to raw bytes when anydoc conversion fails", async () => {
    const r = await tool.execute({ path: `${fixturesDir}/malformed/empty--errors.docx` }, ctx);
    expect(r.isError).toBe(false);
    expect(r.content).toBe("");
  });
});
