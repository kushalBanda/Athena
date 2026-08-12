import Anthropic from "@anthropic-ai/sdk";
import { type EffortLevel, THINKING_BUDGET_TOKENS } from "../effort.js";
import type { Delta, LLMProvider, Message, ToolDef } from "../types.js";
import { cacheableSystemBlock } from "./cache.js";
import { toAnthropicMessages, toAnthropicTools } from "./transform.js";

const BASE_MAX_TOKENS = 8096;

/**
 * Claude Pro/Max OAuth access tokens are always prefixed this way; this is
 * the same substring check pi (github.com/earendil-works/pi) uses to decide
 * whether a credential is an OAuth token vs a plain API key.
 */
const OAUTH_TOKEN_MARKER = "sk-ant-oat";

export function isAnthropicOAuthToken(apiKey: string): boolean {
  return apiKey.includes(OAUTH_TOKEN_MARKER);
}

/**
 * Anthropic's official CLI identity string. The Anthropic API silently
 * requires this exact system-prompt prefix (plus the beta headers below) to
 * accept requests authenticated with a Claude Pro/Max OAuth token — this is
 * reverse-engineered, undocumented behavior shared with pi and Claude Code
 * itself, not a cosmetic choice.
 */
const CLAUDE_CODE_IDENTITY = "You are Claude Code, Anthropic's official CLI for Claude.";

export class AnthropicProvider implements LLMProvider {
  readonly name = "anthropic";
  readonly contextLimit: number;
  readonly model: string;

  private client: Anthropic;
  private effort: EffortLevel | undefined;
  private isOAuth: boolean;

  constructor(
    apiKey: string,
    model = "claude-sonnet-4-6",
    contextLimit = 200_000,
    effort?: EffortLevel,
  ) {
    this.isOAuth = isAnthropicOAuthToken(apiKey);
    this.client = this.isOAuth
      ? new Anthropic({
          apiKey: null,
          authToken: apiKey,
          defaultHeaders: {
            "anthropic-beta": "claude-code-20250219,oauth-2025-04-20",
            "anthropic-dangerous-direct-browser-access": "true",
            "x-app": "cli",
          },
        })
      : new Anthropic({ apiKey });
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
      ...(this.isOAuth
        ? { system: this.oauthSystemBlock(systemPrompt) }
        : systemPrompt
          ? { system: cacheableSystemBlock(systemPrompt) }
          : {}),
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

  private oauthSystemBlock(systemPrompt: string | undefined): Anthropic.TextBlockParam[] {
    const blocks: Anthropic.TextBlockParam[] = [{ type: "text", text: CLAUDE_CODE_IDENTITY }];
    if (systemPrompt) blocks.push(...cacheableSystemBlock(systemPrompt));
    else blocks[0]!.cache_control = { type: "ephemeral" };
    return blocks;
  }

  async countTokens(messages: Message[]): Promise<number> {
    const result = await this.client.messages.countTokens({
      model: this.model,
      messages: toAnthropicMessages(messages),
    });
    return result.input_tokens;
  }
}
