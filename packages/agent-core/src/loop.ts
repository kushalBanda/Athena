import { getTracer } from "@athena/observability";
import type { LLMProvider } from "@athena/providers";
import type { Tool, ToolContext } from "@athena/tools";
import { SpanStatusCode, context, trace } from "@opentelemetry/api";
import { charsToTokens, estimateContextTokens } from "./compaction/estimate.js";
import { DEFAULT_COMPACTION_SETTINGS, compact, shouldCompact } from "./compaction/index.js";
import { newId, toProviderMessages, toToolDefs } from "./session.js";
import { runTool } from "./tool-runner.js";
import type {
  AgentCallbacks,
  AgentMessage,
  AgentSession,
  CompactionSettings,
  ContentBlock,
  TokenUsage,
  ToolCall,
} from "./types.js";

const MAX_CONSECUTIVE_ERRORS = 5;

export interface LoopOptions {
  provider: LLMProvider;
  tools: Tool[];
  systemPrompt: string;
  initialMessages: AgentMessage[];
  cwd: string;
  callbacks: AgentCallbacks;
  signal?: AbortSignal;
  compactionSettings?: CompactionSettings;
  /** Stable id passed to providers as a cache-key hint (e.g. OpenAI `prompt_cache_key`). Defaults to a fresh id per loop run — in-memory only, never persisted. */
  sessionId?: string;
}

export async function runLoop(options: LoopOptions): Promise<AgentSession> {
  const {
    provider,
    tools,
    systemPrompt,
    cwd,
    callbacks,
    signal,
    compactionSettings = DEFAULT_COMPACTION_SETTINGS,
    sessionId = crypto.randomUUID(),
  } = options;

  const registry = new Map<string, Tool>(tools.map((t) => [t.name, t]));
  const toolDefs = toToolDefs(tools);
  const ctx: ToolContext = { workingDir: cwd };

  const messages: AgentMessage[] = [...options.initialMessages];
  const totalUsage: TokenUsage = {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    totalTokens: 0,
  };
  let consecutiveErrors = 0;
  const tracer = getTracer();
  let turnIndex = 0;

  while (true) {
    if (signal?.aborted) break;

    const turnSpan = tracer.startSpan("athena.turn", {
      attributes: { "athena.turn.index": turnIndex },
    });
    const turnCtx = trace.setSpan(context.active(), turnSpan);
    turnIndex++;

    let shouldBreak: boolean;
    try {
      shouldBreak = await context.with(turnCtx, async (): Promise<boolean> => {
        const { tokens } = estimateContextTokens(messages);
        if (shouldCompact(tokens, provider.contextLimit, compactionSettings)) {
          callbacks.onCompacting();
          const result = await compact(messages, compactionSettings, provider);

          const summaryMsg: AgentMessage = {
            id: newId(),
            role: "compaction_summary",
            content: `<compaction-summary>\n${result.summary}\n</compaction-summary>`,
            timestamp: Date.now(),
          };

          messages.length = 0;
          messages.push(summaryMsg, ...result.retainedTail);
        }

        if (signal?.aborted) return true;

        callbacks.onThinking(true);

        let assistantText = "";
        const pendingToolCalls: Array<{ id: string; name: string; inputJson: string }> = [];
        let lastUsage: TokenUsage | undefined;

        const providerMessages = toProviderMessages(messages);

        const turnInputEstimate = tokens;
        callbacks.onTokenUpdate(
          totalUsage.input + turnInputEstimate,
          totalUsage.output,
          totalUsage.cacheRead,
          totalUsage.cacheWrite,
        );

        const chatSpan = tracer.startSpan("llm.chat", {
          attributes: {
            "gen_ai.system": provider.name,
            "gen_ai.request.model": provider.model,
          },
        });

        try {
          for await (const delta of provider.chat(
            providerMessages,
            toolDefs,
            systemPrompt,
            sessionId,
          )) {
            if (signal?.aborted) break;

            if (delta.type === "text") {
              assistantText += delta.text;
              callbacks.onAssistantToken(delta.text);
              callbacks.onTokenUpdate(
                totalUsage.input + turnInputEstimate,
                totalUsage.output + charsToTokens(assistantText.length),
                totalUsage.cacheRead,
                totalUsage.cacheWrite,
              );
            } else if (delta.type === "tool_call") {
              let pending = pendingToolCalls.find((p) => p.id === delta.id);
              if (!pending) {
                pending = { id: delta.id, name: delta.name, inputJson: "" };
                pendingToolCalls.push(pending);
              }
              pending.inputJson += delta.inputChunk;
            } else if (delta.type === "usage") {
              lastUsage = {
                input: delta.usage.inputTokens,
                output: delta.usage.outputTokens,
                cacheRead: delta.usage.cacheReadTokens,
                cacheWrite: delta.usage.cacheWriteTokens,
                totalTokens: delta.usage.inputTokens + delta.usage.outputTokens,
                ...(delta.usage.costUsd !== undefined ? { costUsd: delta.usage.costUsd } : {}),
              };
            } else if (delta.type === "done") {
              break;
            }
          }
        } catch (err) {
          callbacks.onThinking(false);
          chatSpan.recordException(err instanceof Error ? err : new Error(String(err)));
          chatSpan.setStatus({ code: SpanStatusCode.ERROR });
          chatSpan.end();
          throw err;
        }

        if (lastUsage) {
          chatSpan.setAttributes({
            "gen_ai.usage.input_tokens": lastUsage.input,
            "gen_ai.usage.output_tokens": lastUsage.output,
          });
        }
        chatSpan.end();

        callbacks.onThinking(false);

        const assistantContent: ContentBlock[] = [];
        if (assistantText) {
          assistantContent.push({ type: "text", text: assistantText });
        }

        const toolCalls: ToolCall[] = [];
        for (const p of pendingToolCalls) {
          let input: unknown;
          try {
            input = JSON.parse(p.inputJson || "{}");
          } catch {
            input = {};
          }
          const tc: ToolCall = { id: p.id, name: p.name, input };
          toolCalls.push(tc);
          assistantContent.push({ type: "tool_call", id: p.id, name: p.name, input });
        }

        const assistantMsg: AgentMessage = {
          id: newId(),
          role: "assistant",
          content: assistantContent,
          timestamp: Date.now(),
          ...(lastUsage !== undefined ? { usage: lastUsage } : {}),
        };
        messages.push(assistantMsg);

        if (lastUsage) {
          totalUsage.input += lastUsage.input;
          totalUsage.output += lastUsage.output;
          totalUsage.cacheRead += lastUsage.cacheRead;
          totalUsage.cacheWrite += lastUsage.cacheWrite;
          totalUsage.totalTokens += lastUsage.totalTokens;
          if (lastUsage.costUsd !== undefined) {
            totalUsage.costUsd = (totalUsage.costUsd ?? 0) + lastUsage.costUsd;
          }
          callbacks.onTokenUpdate(
            totalUsage.input,
            totalUsage.output,
            totalUsage.cacheRead,
            totalUsage.cacheWrite,
          );
        }

        if (toolCalls.length === 0) return true;

        const toolResultBlocks: ContentBlock[] = [];

        for (const call of toolCalls) {
          if (signal?.aborted) break;

          callbacks.onToolCall({ id: call.id, name: call.name, input: call.input });

          const toolSpan = tracer.startSpan("tool.exec", {
            attributes: { "tool.name": call.name },
          });
          const result = await context.with(trace.setSpan(context.active(), toolSpan), () =>
            runTool(call, registry, ctx, callbacks),
          );
          toolSpan.setAttribute("tool.success", !result.isError);
          if (result.isError) toolSpan.setStatus({ code: SpanStatusCode.ERROR });
          toolSpan.end();

          callbacks.onToolResult(
            call.id,
            result.content,
            result.isError ? "err" : "ok",
            result.metadata,
          );

          toolResultBlocks.push({
            type: "tool_result",
            toolCallId: result.toolCallId,
            content: result.content,
            isError: result.isError,
          });

          if (result.isError) {
            consecutiveErrors++;
          } else {
            consecutiveErrors = 0;
          }
        }

        if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
          callbacks.onAssistantToken(
            `\n[Warning: ${MAX_CONSECUTIVE_ERRORS} consecutive tool errors — check tool inputs]\n`,
          );
        }

        const toolResultMsg: AgentMessage = {
          id: newId(),
          role: "tool_result",
          content: toolResultBlocks,
          timestamp: Date.now(),
        };
        messages.push(toolResultMsg);
        return false;
      });
    } finally {
      turnSpan.end();
    }

    if (shouldBreak) break;
  }

  return { messages, tokenUsage: totalUsage };
}
