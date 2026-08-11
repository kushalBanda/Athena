import Anthropic from "@anthropic-ai/sdk";
import { THINKING_BUDGET_TOKENS, type EffortLevel } from "../effort.js";
import type { Delta, LLMProvider, Message, ToolDef } from "../types.js";
import { cacheableSystemBlock } from "./cache.js";
import { toAnthropicMessages, toAnthropicTools } from "./transform.js";

const BASE_MAX_TOKENS = 8096;

export class AnthropicProvider implements LLMProvider {
  readonly name = "anthropic";
  readonly contextLimit: number;
  readonly model: string;

  private client: Anthropic;
  private effort: EffortLevel | undefined;

  constructor(
    apiKey: string,
    model = "claude-sonnet-4-6",
    contextLimit = 200_000,
    effort?: EffortLevel,
  ) {
    this.client = new Anthropic({ apiKey });
    this.model = model;
    this.contextLimit = contextLimit;
    this.effort = effort;
  }

  async *chat(
    messages: Message[],
    tools: ToolDef[],
    systemPrompt?: string,
    _sessionId?: string,
  ): AsyncIterable<Delta> {
    // Anthropic caches by exact-prefix match, not by a caller-supplied key, so
    // sessionId isn't used here — breakpoints alone control what's cached.
    const budgetTokens = this.effort ? THINKING_BUDGET_TOKENS[this.effort] : undefined;
    const stream = await this.client.messages.stream({
      model: this.model,
      max_tokens: budgetTokens ? budgetTokens + BASE_MAX_TOKENS : BASE_MAX_TOKENS,
      messages: toAnthropicMessages(messages, { cacheLastBlock: true }),
      ...(systemPrompt ? { system: cacheableSystemBlock(systemPrompt) } : {}),
      ...(tools.length > 0 ? { tools: toAnthropicTools(tools, { cacheLastTool: true }) } : {}),
      ...(budgetTokens
        ? { thinking: { type: "enabled" as const, budget_tokens: budgetTokens } }
        : {}),
    });

    const blockIds = new Map<number, string>();
    let inputTokens = 0;
    let cacheReadTokens = 0;
    let cacheWriteTokens = 0;

    for await (const event of stream) {
      if (event.type === "message_start") {
        inputTokens = event.message.usage.input_tokens;
        cacheReadTokens = event.message.usage.cache_read_input_tokens ?? 0;
        cacheWriteTokens = event.message.usage.cache_creation_input_tokens ?? 0;
      } else if (event.type === "message_delta") {
        yield {
          type: "usage",
          usage: {
            inputTokens,
            outputTokens: event.usage.output_tokens,
            cacheReadTokens,
            cacheWriteTokens,
          },
        };
      } else if (event.type === "content_block_delta") {
        if (event.delta.type === "text_delta") {
          yield { type: "text", text: event.delta.text };
        } else if (event.delta.type === "input_json_delta") {
          const id = blockIds.get(event.index) ?? "";
          yield {
            type: "tool_call",
            id,
            name: "",
            inputChunk: event.delta.partial_json,
          };
        }
      } else if (event.type === "content_block_start") {
        if (event.content_block.type === "tool_use") {
          blockIds.set(event.index, event.content_block.id);
          yield {
            type: "tool_call",
            id: event.content_block.id,
            name: event.content_block.name,
            inputChunk: "",
          };
        }
      }
    }

    yield { type: "done" };
  }

  async countTokens(messages: Message[]): Promise<number> {
    const result = await this.client.messages.countTokens({
      model: this.model,
      messages: toAnthropicMessages(messages),
    });
    return result.input_tokens;
  }
}
