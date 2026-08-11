import { describe, expect, it } from "bun:test";
import type { Tool, ToolContext, ToolResult as ToolExecResult } from "@athena/tools";
import type { ToolDef } from "@athena/providers";
import { runTool } from "../src/tool-runner.js";
import { makeNoopCallbacks } from "./helpers.js";

const ctx: ToolContext = { workingDir: "/tmp" };
const callbacks = makeNoopCallbacks();

function makeTool(
  name: string,
  result: ToolExecResult,
  permission: "auto" | "prompt" = "auto",
): Tool {
  return {
    name,
    description: "",
    inputSchema: {},
    permission,
    execute: async () => result,
    toToolDef: (): ToolDef => ({ name, description: "", inputSchema: {} }),
  };
}

function errorTool(name: string): Tool {
  return {
    name,
    description: "",
    inputSchema: {},
    permission: "auto",
    execute: async () => {
      throw new Error("boom");
    },
    toToolDef: (): ToolDef => ({ name, description: "", inputSchema: {} }),
  };
}

describe("runTool", () => {
  it("executes a known auto-permission tool", async () => {
    const registry = new Map([["echo", makeTool("echo", { content: "ok", isError: false })]]);
    const result = await runTool({ id: "1", name: "echo", input: {} }, registry, ctx, callbacks);
    expect(result.isError).toBe(false);
    expect(result.content).toBe("ok");
  });

  it("returns error for unknown tool name", async () => {
    const result = await runTool({ id: "1", name: "ghost", input: {} }, new Map(), ctx, callbacks);
    expect(result.isError).toBe(true);
    expect(result.content).toContain("tool not found");
  });

  it("prompt tool allowed when onPermissionRequest returns true", async () => {
    const registry = new Map([
      ["shell_exec", makeTool("shell_exec", { content: "ran", isError: false }, "prompt")],
    ]);
    const cb = { ...callbacks, onPermissionRequest: async () => true };
    const result = await runTool({ id: "1", name: "shell_exec", input: {} }, registry, ctx, cb);
    expect(result.isError).toBe(false);
    expect(result.content).toBe("ran");
  });

  it("prompt tool denied when onPermissionRequest returns false", async () => {
    const registry = new Map([
      ["shell_exec", makeTool("shell_exec", { content: "ran", isError: false }, "prompt")],
    ]);
    const cb = { ...callbacks, onPermissionRequest: async () => false };
    const result = await runTool({ id: "1", name: "shell_exec", input: {} }, registry, ctx, cb);
    expect(result.isError).toBe(true);
    expect(result.content).toContain("permission denied");
  });

  it("prompt tool denied when no onPermissionRequest callback", async () => {
    const registry = new Map([
      ["shell_exec", makeTool("shell_exec", { content: "ran", isError: false }, "prompt")],
    ]);
    const cb = { ...callbacks, onPermissionRequest: undefined };
    const result = await runTool({ id: "1", name: "shell_exec", input: {} }, registry, ctx, cb);
    expect(result.isError).toBe(true);
  });

  it("catches tool execution errors and returns ToolResult", async () => {
    const registry = new Map([["boom", errorTool("boom")]]);
    const result = await runTool({ id: "1", name: "boom", input: {} }, registry, ctx, callbacks);
    expect(result.isError).toBe(true);
    expect(result.content).toContain("tool error");
    expect(result.content).toContain("boom");
  });

  it("propagates toolCallId", async () => {
    const registry = new Map([["t", makeTool("t", { content: "x", isError: false })]]);
    const result = await runTool({ id: "call-99", name: "t", input: {} }, registry, ctx, callbacks);
    expect(result.toolCallId).toBe("call-99");
  });

  it("forwards metadata when the tool result includes it", async () => {
    const registry = new Map([
      [
        "edit_file",
        makeTool("edit_file", {
          content: "Edited",
          isError: false,
          metadata: { diff: "x", additions: 1, deletions: 0 },
        }),
      ],
    ]);
    const result = await runTool(
      { id: "1", name: "edit_file", input: {} },
      registry,
      ctx,
      callbacks,
    );
    expect(result.metadata).toEqual({ diff: "x", additions: 1, deletions: 0 });
  });

  it("omits metadata when the tool result has none", async () => {
    const registry = new Map([["echo", makeTool("echo", { content: "ok", isError: false })]]);
    const result = await runTool({ id: "1", name: "echo", input: {} }, registry, ctx, callbacks);
    expect(result.metadata).toBeUndefined();
  });
});
