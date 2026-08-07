import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { trace } from "@opentelemetry/api";
import { InMemorySpanExporter, SimpleSpanProcessor } from "@opentelemetry/sdk-trace-base";
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";
import { runAgent } from "../src/index.js";
import { makeNoopCallbacks, makeSequentialProvider } from "./helpers.js";

const noopCallbacks = makeNoopCallbacks();

describe("agent loop tracing", () => {
  let exporter: InMemorySpanExporter;
  let provider: NodeTracerProvider;

  beforeEach(() => {
    exporter = new InMemorySpanExporter();
    provider = new NodeTracerProvider({ spanProcessors: [new SimpleSpanProcessor(exporter)] });
    provider.register();
  });

  afterEach(async () => {
    await provider.shutdown();
    trace.disable();
  });

  it("opens an athena.turn span for each loop iteration", async () => {
    await runAgent("hello", {
      provider: makeSequentialProvider([[{ type: "text", text: "hi" }, { type: "done" }]]),
      tools: [],
      cwd: "/tmp",
      callbacks: noopCallbacks,
    });

    const turnSpans = exporter.getFinishedSpans().filter((s) => s.name === "athena.turn");
    expect(turnSpans).toHaveLength(1);
    expect(turnSpans[0]?.attributes["athena.turn.index"]).toBe(0);
  });

  it("opens an llm.chat span with GenAI attributes for each provider.chat() call", async () => {
    await runAgent("hello", {
      provider: makeSequentialProvider([
        [
          { type: "text", text: "hi" },
          {
            type: "usage",
            usage: { inputTokens: 12, outputTokens: 3, cacheReadTokens: 0, cacheWriteTokens: 0 },
          },
          { type: "done" },
        ],
      ]),
      tools: [],
      cwd: "/tmp",
      callbacks: noopCallbacks,
    });

    const spans = exporter.getFinishedSpans();
    const chatSpans = spans.filter((s) => s.name === "llm.chat");
    expect(chatSpans).toHaveLength(1);
    expect(chatSpans[0]?.attributes["gen_ai.system"]).toBe("mock");
    expect(chatSpans[0]?.attributes["gen_ai.request.model"]).toBe("mock");
    expect(chatSpans[0]?.attributes["gen_ai.usage.input_tokens"]).toBe(12);
    expect(chatSpans[0]?.attributes["gen_ai.usage.output_tokens"]).toBe(3);
    expect(chatSpans[0]?.parentSpanId).toBe(
      spans.find((s) => s.name === "athena.turn")?.spanContext().spanId,
    );
  });

  it("opens a tool.exec span per tool call with name and success attributes", async () => {
    const tool = {
      name: "test_tool",
      description: "test",
      inputSchema: {},
      permission: "auto" as const,
      async execute() {
        return { content: "ok", isError: false };
      },
      toToolDef() {
        return { name: "test_tool", description: "test", inputSchema: {} };
      },
    };

    await runAgent("hello", {
      provider: makeSequentialProvider([
        [{ type: "tool_call", id: "1", name: "test_tool", inputChunk: "{}" }, { type: "done" }],
        [{ type: "text", text: "done" }, { type: "done" }],
      ]),
      tools: [tool],
      cwd: "/tmp",
      callbacks: noopCallbacks,
    });

    const toolSpans = exporter.getFinishedSpans().filter((s) => s.name === "tool.exec");
    expect(toolSpans).toHaveLength(1);
    expect(toolSpans[0]?.attributes["tool.name"]).toBe("test_tool");
    expect(toolSpans[0]?.attributes["tool.success"]).toBe(true);
  });
});
