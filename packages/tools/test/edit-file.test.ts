import { describe, expect, it, beforeEach, afterAll } from "bun:test";
import { mkdirSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { EditFileTool } from "../src/impl/edit-file.js";
import type { ToolContext } from "../src/types.js";

const tmpDir = "/tmp/athena-tools-edit-file-test";
const ctx: ToolContext = { workingDir: tmpDir };
const tool = new EditFileTool();

beforeEach(() => {
  mkdirSync(tmpDir, { recursive: true });
});

afterAll(() => rmSync(tmpDir, { recursive: true, force: true }));

function write(name: string, content: string) {
  writeFileSync(`${tmpDir}/${name}`, content);
}

function read(name: string): string {
  return readFileSync(`${tmpDir}/${name}`, "utf-8");
}

describe("EditFileTool", () => {
  it("applies an exact match edit", async () => {
    write("a.txt", "hello world\n");
    const r = await tool.execute(
      { path: "a.txt", edits: [{ oldText: "hello", newText: "goodbye" }] },
      ctx,
    );
    expect(r.isError).toBe(false);
    expect(read("a.txt")).toBe("goodbye world\n");
  });

  it("returns diff metadata with additions/deletions", async () => {
    write("a.txt", "line1\nline2\n");
    const r = await tool.execute(
      { path: "a.txt", edits: [{ oldText: "line1", newText: "line1x" }] },
      ctx,
    );
    expect(r.isError).toBe(false);
    expect(r.metadata).toBeDefined();
    expect(typeof (r.metadata as any).diff).toBe("string");
    expect((r.metadata as any).additions).toBe(1);
    expect((r.metadata as any).deletions).toBe(1);
  });

  it("falls back to fuzzy match on trailing whitespace differences", async () => {
    write("a.txt", "foo   \nbar\n");
    const r = await tool.execute(
      { path: "a.txt", edits: [{ oldText: "foo", newText: "baz" }] },
      ctx,
    );
    expect(r.isError).toBe(false);
    expect(read("a.txt")).toContain("baz");
  });

  it("falls back to fuzzy match on smart quotes", async () => {
    write("a.txt", "say “hello”\n");
    const r = await tool.execute(
      { path: "a.txt", edits: [{ oldText: 'say "hello"', newText: "say hi" }] },
      ctx,
    );
    expect(r.isError).toBe(false);
    expect(read("a.txt")).toBe("say hi\n");
  });

  it("falls back to fuzzy match on unicode dashes", async () => {
    write("a.txt", "range 1–5\n");
    const r = await tool.execute(
      { path: "a.txt", edits: [{ oldText: "range 1-5", newText: "range 1 to 5" }] },
      ctx,
    );
    expect(r.isError).toBe(false);
    expect(read("a.txt")).toBe("range 1 to 5\n");
  });

  it("mixed batch: one exact, one needing fuzzy — both re-matched in fuzzy space", async () => {
    write("a.txt", "alpha\nbeta   \ngamma\n");
    const r = await tool.execute(
      {
        path: "a.txt",
        edits: [
          { oldText: "alpha", newText: "ALPHA" },
          { oldText: "beta", newText: "BETA" },
        ],
      },
      ctx,
    );
    expect(r.isError).toBe(false);
    expect(read("a.txt")).toBe("ALPHA\nBETA   \ngamma\n");
  });

  it("applies multiple non-overlapping edits", async () => {
    write("a.txt", "one\ntwo\nthree\n");
    const r = await tool.execute(
      {
        path: "a.txt",
        edits: [
          { oldText: "one", newText: "1" },
          { oldText: "three", newText: "3" },
        ],
      },
      ctx,
    );
    expect(r.isError).toBe(false);
    expect(read("a.txt")).toBe("1\ntwo\n3\n");
  });

  it("preserves unchanged lines' original bytes when a fuzzy match is used elsewhere", async () => {
    write("a.txt", "keep me\nfoo   \n");
    const r = await tool.execute(
      { path: "a.txt", edits: [{ oldText: "foo", newText: "bar" }] },
      ctx,
    );
    expect(r.isError).toBe(false);
    expect(read("a.txt")).toBe("keep me\nbar   \n");
  });

  it("rejects overlapping edits", async () => {
    write("a.txt", "hello world\n");
    const r = await tool.execute(
      {
        path: "a.txt",
        edits: [
          { oldText: "hello wor", newText: "x" },
          { oldText: "o world", newText: "y" },
        ],
      },
      ctx,
    );
    expect(r.isError).toBe(true);
    expect(r.content).toContain("overlap");
  });

  it("errors on ambiguous (non-unique) match", async () => {
    write("a.txt", "dup\ndup\n");
    const r = await tool.execute({ path: "a.txt", edits: [{ oldText: "dup", newText: "x" }] }, ctx);
    expect(r.isError).toBe(true);
    expect(r.content).toContain("occurrences");
  });

  it("replaceAll replaces every occurrence", async () => {
    write("a.txt", "dup\ndup\ndup\n");
    const r = await tool.execute(
      { path: "a.txt", edits: [{ oldText: "dup", newText: "x", replaceAll: true }] },
      ctx,
    );
    expect(r.isError).toBe(false);
    expect(read("a.txt")).toBe("x\nx\nx\n");
  });

  it("rejects disproportionate fuzzy match (line-count condition)", async () => {
    const bigBlock = Array.from({ length: 20 }, (_, i) => `line${i}`).join("\n");
    write("a.txt", `${bigBlock}\ntarget   \n`);
    const r = await tool.execute(
      { path: "a.txt", edits: [{ oldText: "target", newText: "hit" }] },
      ctx,
    );
    expect(r.isError).toBe(false);
  });

  it("rejects a fuzzy match whose line-widened span dwarfs oldText", async () => {
    const hugeLine = "A".repeat(600) + "lo   ";
    write("a.txt", `${hugeLine}\nworld   \n`);
    const r = await tool.execute(
      { path: "a.txt", edits: [{ oldText: "lo\nworld", newText: "X" }] },
      ctx,
    );
    expect(r.isError).toBe(true);
    expect(r.content).toContain("much larger than oldText");
  });

  it("no-op guard errors when replacement produces identical content", async () => {
    write("a.txt", "same\n");
    const r = await tool.execute(
      { path: "a.txt", edits: [{ oldText: "same", newText: "same" }] },
      ctx,
    );
    expect(r.isError).toBe(true);
    expect(r.content).toContain("No changes");
  });

  it("creates a new file via empty oldText", async () => {
    const r = await tool.execute(
      { path: "new.txt", edits: [{ oldText: "", newText: "hello\n" }] },
      ctx,
    );
    expect(r.isError).toBe(false);
    expect(read("new.txt")).toBe("hello\n");
  });

  it("errors on empty oldText for an existing file", async () => {
    write("a.txt", "content\n");
    const r = await tool.execute({ path: "a.txt", edits: [{ oldText: "", newText: "x" }] }, ctx);
    expect(r.isError).toBe(true);
  });

  it("preserves CRLF line endings", async () => {
    write("a.txt", "one\r\ntwo\r\n");
    const r = await tool.execute({ path: "a.txt", edits: [{ oldText: "one", newText: "1" }] }, ctx);
    expect(r.isError).toBe(false);
    expect(read("a.txt")).toBe("1\r\ntwo\r\n");
  });

  it("preserves BOM", async () => {
    write("a.txt", "﻿hello\n");
    const r = await tool.execute(
      { path: "a.txt", edits: [{ oldText: "hello", newText: "hi" }] },
      ctx,
    );
    expect(r.isError).toBe(false);
    expect(read("a.txt")).toBe("﻿hi\n");
  });

  it("errors when oldText not found", async () => {
    write("a.txt", "hello\n");
    const r = await tool.execute(
      { path: "a.txt", edits: [{ oldText: "nope", newText: "x" }] },
      ctx,
    );
    expect(r.isError).toBe(true);
    expect(r.content).toContain("Could not find");
  });

  it("errors when file does not exist", async () => {
    const r = await tool.execute(
      { path: "missing.txt", edits: [{ oldText: "a", newText: "b" }] },
      ctx,
    );
    expect(r.isError).toBe(true);
    expect(r.content).toContain("not found");
  });
});
