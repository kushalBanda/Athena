import type Anthropic from "@anthropic-ai/sdk";
import type { Message, ToolDef } from "../types.js";
import { type Cacheable, markLastAsCacheBreakpoint } from "./cache.js";

export function toAnthropicMessages(
  messages: Message[],
  options?: { cacheLastBlock?: boolean },
): Anthropic.MessageParam[] {
  const result = messages.map((msg): Anthropic.MessageParam => {
    if (msg.role === "tool") {
      return {
        role: "user",
        content: msg.content
          .filter((c) => c.type === "tool_result")
          .map(
            (c): Anthropic.ToolResultBlockParam => ({
              type: "tool_result",
              tool_use_id: c.type === "tool_result" ? c.toolCallId : "",
              content: c.type === "tool_result" ? c.content : "",
              is_error: c.type === "tool_result" ? (c.isError ?? false) : false,
            }),
          ),
      };
    }

    return {
      role: msg.role as "user" | "assistant",
      content: msg.content.map((c) => {
        if (c.type === "text") {
          return { type: "text" as const, text: c.text };
        }
        if (c.type === "tool_call") {
          return {
            type: "tool_use" as const,
            id: c.id,
            name: c.name,
            input: c.input as Record<string, unknown>,
          };
        }
        return { type: "text" as const, text: "" };
      }),
    };
  });

  if (options?.cacheLastBlock) {
    const last = result[result.length - 1];
    // Blocks this function emits are always text/tool_use/tool_result, all of
    // which accept cache_control; the SDK's broader union (e.g. redacted
    // thinking) doesn't apply here.
    if (last && Array.isArray(last.content)) {
      markLastAsCacheBreakpoint(last.content as Cacheable[]);
    }
  }

  return result;
}

export function toAnthropicTools(
  tools: ToolDef[],
  options?: { cacheLastTool?: boolean },
): Anthropic.Tool[] {
  const result = tools.map(
    (t): Anthropic.Tool => ({
      name: t.name,
      description: t.description,
      input_schema: t.inputSchema as Anthropic.Tool["input_schema"],
    }),
  );

  if (options?.cacheLastTool) markLastAsCacheBreakpoint(result);

  return result;
}
