import type { Message, ToolDef } from "@athena/providers";
import type { Tool } from "@athena/tools";
import type { AgentMessage, ContentBlock, ToolCallBlock } from "./types.js";

export function toProviderMessages(messages: AgentMessage[]): Message[] {
  return messages.map((msg): Message => {
    if (msg.role === "compaction_summary" || msg.role === "user") {
      const text = typeof msg.content === "string" ? msg.content : extractText(msg.content);
      return { role: "user", content: [{ type: "text", text }] };
    }

    if (msg.role === "assistant") {
      if (typeof msg.content === "string") {
        return { role: "assistant", content: [{ type: "text", text: msg.content }] };
      }
      return {
        role: "assistant",
        content: msg.content
          .filter((b): b is ContentBlock => b.type === "text" || b.type === "tool_call")
          .map((b) => {
            if (b.type === "text") return { type: "text" as const, text: b.text };
            const tc = b as ToolCallBlock;
            return { type: "tool_call" as const, id: tc.id, name: tc.name, input: tc.input };
          }),
      };
    }

    if (msg.role === "tool_result") {
      const blocks = Array.isArray(msg.content)
        ? msg.content.filter((b): b is ContentBlock & { type: "tool_result" } => b.type === "tool_result")
        : [];
      return {
        role: "tool",
        content: blocks.map((b) => ({
          type: "tool_result" as const,
          toolCallId: b.toolCallId,
          content: b.content,
          isError: b.isError,
        })),
      };
    }

    return { role: "user", content: [{ type: "text", text: "" }] };
  });
}

function extractText(blocks: ContentBlock[]): string {
  return blocks
    .filter((b): b is ContentBlock & { type: "text" } => b.type === "text")
    .map((b) => b.text)
    .join("");
}

export function toToolDefs(tools: Tool[]): ToolDef[] {
  return tools.map((t) => t.toToolDef());
}

let idCounter = 0;
export function newId(): string {
  return `msg_${Date.now()}_${++idCounter}`;
}
