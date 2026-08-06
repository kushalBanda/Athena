import { describe, expect, it } from "bun:test";
import type { ToolDef } from "@athena/providers";
import type { Tool, ToolContext, ToolResult as ToolExecResult } from "@athena/tools";
import { runAgent } from "../src/index.js";
import { makeMockProvider, makeNoopCallbacks, makeSequentialProvider } from "./helpers.js";

const noopCallbacks = makeNoopCallbacks();

function makeMockTool(name: string, result: string): Tool {
  return {
    name,
    description: `Mock ${name}`,
    inputSchema: {},
    permission: "auto" as const,
    async execute(_input: unknown, _ctx: ToolContext): Promise<ToolExecResult> {
      return { content: result, isError: false };
    },
    toToolDef(): ToolDef {
      return { name, description: `Mock ${name}`, inputSchema: {} };
    },
  };
}


describe("runAgent - single turn, no tools", () => {
  it("returns assistant message", async () => {
    const provider = makeSequentialProvider([
      [{ type: "text", text: "Hello there" }, { type: "done" }],
    ]);
    const session = await runAgent("say hello", {
      provider,
      tools: [],
      cwd: "/tmp",
      callbacks: noopCallbacks,
    });

    const assistantMsgs = session.messages.filter((m) => m.role === "assistant");
    expect(assistantMsgs.length).toBe(1);
    const content = assistantMsgs[0].content;
    const text = Array.isArray(content) ? content.find((b) => b.type === "text") : null;
    expect(text && "text" in text ? text.text : "").toBe("Hello there");
  });
});

describe("runAgent - cost propagation", () => {
  it("propagates costUsd from a provider usage delta onto tokenUsage", async () => {
    const provider = makeMockProvider([
      { type: "text", text: "hi" },
      {
        type: "usage",
        usage: { inputTokens: 10, outputTokens: 5, cacheReadTokens: 0, cacheWriteTokens: 0, costUsd: 0.0042 },
      },
      { type: "done" },
    ]);

    const session = await runAgent("hello", {
      provider,
      tools: [],
      cwd: "/tmp",
      callbacks: noopCallbacks,
    });

    expect(session.tokenUsage.costUsd).toBeCloseTo(0.0042, 6);
  });

  it("leaves costUsd undefined when the provider doesn't report one", async () => {
    const provider = makeMockProvider([
      { type: "text", text: "hi" },
      { type: "usage", usage: { inputTokens: 10, outputTokens: 5, cacheReadTokens: 0, cacheWriteTokens: 0 } },
      { type: "done" },
    ]);

    const session = await runAgent("hello", {
      provider,
      tools: [],
      cwd: "/tmp",
      callbacks: noopCallbacks,
    });

    expect(session.tokenUsage.costUsd).toBeUndefined();
  });
});

describe("runAgent - tool call", () => {
  it("executes tool and produces tool_result message", async () => {
    const provider = makeSequentialProvider([
      [
        { type: "tool_call", id: "tc1", name: "echo_tool", inputChunk: '{"msg":' },
        { type: "tool_call", id: "tc1", name: "echo_tool", inputChunk: '"hi"}' },
        { type: "done" },
      ],
      [{ type: "text", text: "Done" }, { type: "done" }],
    ]);

    const tool = makeMockTool("echo_tool", "echoed: hi");
    const session = await runAgent("use echo_tool", {
      provider,
      tools: [tool],
      cwd: "/tmp",
      callbacks: noopCallbacks,
    });

    const toolResults = session.messages.filter((m) => m.role === "tool_result");
    expect(toolResults.length).toBe(1);
  });
});

describe("runAgent - abort signal", () => {
  it("exits cleanly when pre-aborted", async () => {
    const controller = new AbortController();
    controller.abort();

    const provider = makeSequentialProvider([[{ type: "text", text: "hi" }, { type: "done" }]]);
    const session = await runAgent("task", {
      provider,
      tools: [],
      cwd: "/tmp",
      callbacks: noopCallbacks,
      signal: controller.signal,
    });

    expect(session.messages.length).toBeGreaterThanOrEqual(1);
  });
});

describe("runAgent - token usage", () => {
  it("propagates usage deltas into session.tokenUsage and onTokenUpdate", async () => {
    let reportedInput = -1;
    let reportedOutput = -1;
    const callbacks = {
      ...noopCallbacks,
      onTokenUpdate: (input: number, output: number) => {
        reportedInput = input;
        reportedOutput = output;
      },
    };

    const provider = makeSequentialProvider([
      [
        { type: "text", text: "hi" },
        {
          type: "usage",
          usage: { inputTokens: 12, outputTokens: 5, cacheReadTokens: 0, cacheWriteTokens: 0 },
        },
        { type: "done" },
      ],
    ]);

    const session = await runAgent("say hi", {
      provider,
      tools: [],
      cwd: "/tmp",
      callbacks,
    });

    expect(session.tokenUsage.input).toBe(12);
    expect(session.tokenUsage.output).toBe(5);
    expect(session.tokenUsage.totalTokens).toBe(17);
    expect(reportedInput).toBe(12);
    expect(reportedOutput).toBe(5);

    const assistantMsg = session.messages.find((m) => m.role === "assistant");
    expect(assistantMsg?.usage).toEqual({
      input: 12,
      output: 5,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 17,
    });
  });
});

describe("runAgent - unknown tool", () => {
  it("returns error result, does not throw", async () => {
    let toolResultContent = "";
    const callbacks = {
      ...noopCallbacks,
      onToolResult: (_id: string, result: string, _status: "ok" | "err") => {
        toolResultContent = result;
      },
    };

    const provider = makeSequentialProvider([
      [
        { type: "tool_call", id: "x", name: "nonexistent", inputChunk: "{}" },
        { type: "done" },
      ],
      [{ type: "text", text: "recovered" }, { type: "done" }],
    ]);

    await runAgent("call nonexistent tool", {
      provider,
      tools: [],
      cwd: "/tmp",
      callbacks,
    });

    expect(toolResultContent).toContain("tool not found");
  });
});
