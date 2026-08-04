import Anthropic from "@anthropic-ai/sdk";
import type { Delta, LLMProvider, Message, ToolDef } from "../types.js";
import { toAnthropicMessages, toAnthropicTools } from "./transform.js";

export class AnthropicProvider implements LLMProvider {
  readonly name = "anthropic";
  readonly contextLimit: number;

  private client: Anthropic;
  private model: string;

  constructor(apiKey: string, model = "claude-sonnet-4-6", contextLimit = 200_000) {
    this.client = new Anthropic({ apiKey });
    this.model = model;
    this.contextLimit = contextLimit;
  }

  async *chat(messages: Message[], tools: ToolDef[]): AsyncIterable<Delta> {
    const stream = await this.client.messages.stream({
      model: this.model,
      max_tokens: 8096,
      messages: toAnthropicMessages(messages),
      ...(tools.length > 0 ? { tools: toAnthropicTools(tools) } : {}),
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
