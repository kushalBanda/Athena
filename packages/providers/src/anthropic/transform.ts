import type Anthropic from "@anthropic-ai/sdk";
import type { Message, ToolDef } from "../types.js";

export function toAnthropicMessages(
  messages: Message[],
): Anthropic.MessageParam[] {
  return messages.map((msg): Anthropic.MessageParam => {
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
}

export function toAnthropicTools(tools: ToolDef[]): Anthropic.Tool[] {
  return tools.map(
    (t): Anthropic.Tool => ({
      name: t.name,
      description: t.description,
      input_schema: t.inputSchema as Anthropic.Tool["input_schema"],
    }),
  );
}
