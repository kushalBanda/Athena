/**
 * Integration smoke test: real tool execution + mock provider, no network.
 *
 * Verifies the full runAgent pipeline end-to-end:
 *   buildSystemPrompt → loop → tool dispatch → message accumulation → session return
 */
import { describe, expect, it, beforeAll, afterAll } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { runAgent } from "../src/index.js";
import { makeNoopCallbacks, makeSequentialProvider } from "./helpers.js";
import { ReadFileTool, WriteFileTool, GrepTool, ShellExecTool } from "@athena/tools";

const tmpDir = "/tmp/athena-agent-core-smoke";

beforeAll(() => {
  mkdirSync(tmpDir, { recursive: true });
  writeFileSync(`${tmpDir}/target.ts`, 'export const FOO = "bar";');
});

afterAll(() => rmSync(tmpDir, { recursive: true, force: true }));

const tools = [new ReadFileTool(), new WriteFileTool(), new GrepTool()];

describe("runAgent smoke — single turn no tools", () => {
  it("returns assistant response in messages", async () => {
    const provider = makeSequentialProvider([
      [{ type: "text", text: "Task complete." }, { type: "done" }],
    ]);
    const session = await runAgent("hello", {
      provider,
      tools,
      cwd: tmpDir,
      callbacks: makeNoopCallbacks(),
    });
    const assistant = session.messages.find((m) => m.role === "assistant");
    expect(assistant).toBeDefined();
    const textBlock = Array.isArray(assistant!.content)
      ? assistant!.content.find((b) => b.type === "text")
      : null;
    expect(textBlock && "text" in textBlock ? textBlock.text : "").toBe("Task complete.");
  });
});

describe("runAgent smoke — read_file tool call", () => {
  it("executes read_file and returns content in tool_result", async () => {
    const provider = makeSequentialProvider([
      [
        { type: "tool_call", id: "tc1", name: "read_file", inputChunk: `{"path":"${tmpDir}/target.ts"}` },
        { type: "done" },
      ],
      [{ type: "text", text: "File read successfully." }, { type: "done" }],
    ]);

    let toolResultContent = "";
    const callbacks = {
      ...makeNoopCallbacks(),
      onToolResult: (_id: string, result: string, _status: "ok" | "err") => {
        toolResultContent = result;
      },
    };

    const session = await runAgent("read the target file", {
      provider,
      tools,
      cwd: tmpDir,
      callbacks,
    });

    expect(toolResultContent).toContain("FOO");
    const toolResults = session.messages.filter((m) => m.role === "tool_result");
    expect(toolResults.length).toBe(1);
  });
});

describe("runAgent smoke — write_file then read_file", () => {
  it("writes a file then reads it back in two tool calls", async () => {
    const outPath = `${tmpDir}/written.txt`;
    const provider = makeSequentialProvider([
      [
        { type: "tool_call", id: "tc1", name: "write_file", inputChunk: `{"path":"${outPath}","content":"athena wrote this"}` },
        { type: "done" },
      ],
      [
        { type: "tool_call", id: "tc2", name: "read_file", inputChunk: `{"path":"${outPath}"}` },
        { type: "done" },
      ],
      [{ type: "text", text: "Done." }, { type: "done" }],
    ]);

    const toolResults: string[] = [];
    const callbacks = {
      ...makeNoopCallbacks(),
      onToolResult: (_id: string, result: string, _status: "ok" | "err") => {
        toolResults.push(result);
      },
    };

    await runAgent("write then read", { provider, tools, cwd: tmpDir, callbacks });

    expect(toolResults[0]).toContain("Wrote");
    expect(toolResults[1]).toContain("athena wrote this");
  });
});

describe("runAgent smoke — grep tool call", () => {
  it("finds pattern in real files", async () => {
    const provider = makeSequentialProvider([
      [
        {
          type: "tool_call",
          id: "tc1",
          name: "grep",
          inputChunk: `{"pattern":"FOO","path":"${tmpDir}"}`,
        },
        { type: "done" },
      ],
      [{ type: "text", text: "Found it." }, { type: "done" }],
    ]);

    let grepResult = "";
    const callbacks = {
      ...makeNoopCallbacks(),
      onToolResult: (_id: string, result: string) => { grepResult = result; },
    };

    await runAgent("grep for FOO", { provider, tools, cwd: tmpDir, callbacks });
    expect(grepResult).toContain("FOO");
  });
});

describe("runAgent smoke — permission denied for shell_exec", () => {
  it("returns permission denied without executing", async () => {
    const shellTool = new ShellExecTool();
    const allTools = [...tools, shellTool];

    const provider = makeSequentialProvider([
      [
        { type: "tool_call", id: "tc1", name: "shell_exec", inputChunk: '{"command":"echo pwned"}' },
        { type: "done" },
      ],
      [{ type: "text", text: "Denied." }, { type: "done" }],
    ]);

    let resultContent = "";
    const callbacks = {
      ...makeNoopCallbacks(),
      onPermissionRequest: async () => false,
      onToolResult: (_id: string, result: string) => { resultContent = result; },
    };

    await runAgent("run shell", { provider, tools: allTools, cwd: tmpDir, callbacks });
    expect(resultContent).toContain("permission denied");
  });
});

describe("runAgent smoke — abort before loop", () => {
  it("returns partial session with just user message", async () => {
    const controller = new AbortController();
    controller.abort();

    const provider = makeSequentialProvider([
      [{ type: "text", text: "never reached" }, { type: "done" }],
    ]);

    const session = await runAgent("aborted task", {
      provider,
      tools,
      cwd: tmpDir,
      callbacks: makeNoopCallbacks(),
      signal: controller.signal,
    });

    const userMsgs = session.messages.filter((m) => m.role === "user");
    expect(userMsgs.length).toBe(1);
    const assistantMsgs = session.messages.filter((m) => m.role === "assistant");
    expect(assistantMsgs.length).toBe(0);
  });
});
