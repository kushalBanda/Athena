import { describe, expect, it } from "bun:test";
import { ShellExecTool } from "../src/impl/shell-exec.js";
import type { ToolContext } from "../src/types.js";

const ctx: ToolContext = { workingDir: "/tmp" };
const tool = new ShellExecTool();

describe("ShellExecTool", () => {
  it("runs a simple command and captures stdout", async () => {
    const r = await tool.execute({ command: "echo hello_athena" }, ctx);
    expect(r.isError).toBe(false);
    expect(r.content).toContain("hello_athena");
  });

  it("captures stderr from a failing command", async () => {
    const r = await tool.execute({ command: "ls /tmp/no-such-dir-xyz-athena 2>&1; true" }, ctx);
    expect(r.isError).toBe(false);
  });

  it("reports non-zero exit code", async () => {
    const r = await tool.execute({ command: "exit 1" }, ctx);
    expect(r.isError).toBe(true);
  });

  it("runs multi-line commands", async () => {
    const r = await tool.execute({ command: "echo line1\necho line2" }, ctx);
    expect(r.isError).toBe(false);
    expect(r.content).toContain("line1");
    expect(r.content).toContain("line2");
  });

  it("rejects missing command field", async () => {
    const r = await tool.execute({}, ctx);
    expect(r.isError).toBe(true);
    expect(r.content).toContain("Invalid input");
  });
});
