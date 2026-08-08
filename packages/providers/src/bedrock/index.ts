import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { toAnthropicMessages, toAnthropicTools } from "../anthropic/transform.js";
import { yieldOpenAIStream } from "../openai-shared/transform.js";
import { estimateCharsAsTokens } from "../token-estimate.js";
import type { Delta, LLMProvider, Message, ToolDef } from "../types.js";
import { getBedrockModelInfo } from "./models.js";

const ANTHROPIC_VERSION = "2023-06-01";

export interface BedrockConfig {
  apiKey: string;
  model?: string;
  region?: string;
}

/**
 * Routes to Bedrock's `bedrock-mantle` endpoint. Claude models speak the
 * native Anthropic Messages API (`/anthropic/v1/messages`); every other
 * model family speaks the OpenAI-compatible Chat Completions API
 * (`/v1/chat/completions`) — both reachable with the same Bedrock API key,
 * so the client to use is picked per-model, not per-provider-instance.
 */
type BedrockClient =
  | { api: "messages"; client: Anthropic }
  | { api: "chat-completions"; client: OpenAI };

export class BedrockProvider implements LLMProvider {
  readonly name = "bedrock";
  readonly model: string;
  readonly contextLimit: number;

  private readonly target: BedrockClient;

  constructor(config: BedrockConfig) {
    const region = config.region ?? "us-east-1";
    this.model = config.model ?? "anthropic.claude-sonnet-4-6-v1";

    const info = getBedrockModelInfo(this.model);
    this.contextLimit = info.contextLimit;

    this.target =
      info.api === "messages"
        ? {
            api: "messages",
            client: new Anthropic({
              apiKey: config.apiKey,
              baseURL: `https://bedrock-mantle.${region}.api.aws/anthropic`,
              defaultHeaders: { "anthropic-version": ANTHROPIC_VERSION },
            }),
          }
        : {
            api: "chat-completions",
            client: new OpenAI({
              apiKey: config.apiKey,
              baseURL: `https://bedrock-mantle.${region}.api.aws/v1`,
            }),
          };
  }

  async *chat(messages: Message[], tools: ToolDef[], systemPrompt?: string): AsyncIterable<Delta> {
    if (this.target.api === "chat-completions") {
      yield* yieldOpenAIStream(this.target.client, this.model, messages, tools, systemPrompt);
      return;
    }

    const stream = await this.target.client.messages.stream({
      model: this.model,
      max_tokens: 8096,
      messages: toAnthropicMessages(messages),
      ...(systemPrompt ? { system: systemPrompt } : {}),
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
          yield { type: "tool_call", id, name: "", inputChunk: event.delta.partial_json };
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
    if (this.target.api === "messages") {
      const result = await this.target.client.messages.countTokens({
        model: this.model,
        messages: toAnthropicMessages(messages),
      });
      return result.input_tokens;
    }
    return estimateCharsAsTokens(messages);
  }
}
