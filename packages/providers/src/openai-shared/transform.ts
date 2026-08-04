import type OpenAI from "openai";
import type { Delta, Message, ToolCallContent, ToolDef } from "../types.js";

export function toOpenAIMessages(messages: Message[]): OpenAI.ChatCompletionMessageParam[] {
  const result: OpenAI.ChatCompletionMessageParam[] = [];

  for (const msg of messages) {
    if (msg.role === "tool") {
      for (const c of msg.content) {
        if (c.type === "tool_result") {
          result.push({
            role: "tool",
            tool_call_id: c.toolCallId,
            content: c.content,
          });
        }
      }
      continue;
    }

    if (msg.role === "assistant") {
      const textParts = msg.content.filter((c) => c.type === "text");
      const toolCalls = msg.content.filter((c) => c.type === "tool_call");

      const assistantMsg: OpenAI.ChatCompletionAssistantMessageParam = {
        role: "assistant",
        content: textParts.map((c) => (c.type === "text" ? c.text : "")).join("") || null,
      };
      if (toolCalls.length > 0) {
        assistantMsg.tool_calls = toolCalls.map((c) => {
          const tc = c as ToolCallContent;
          return {
            id: tc.id,
            type: "function" as const,
            function: { name: tc.name, arguments: JSON.stringify(tc.input) },
          };
        });
      }
      result.push(assistantMsg);
      continue;
    }

    result.push({
      role: "user",
      content: msg.content
        .filter((c) => c.type === "text")
        .map((c) => (c.type === "text" ? c.text : ""))
        .join(""),
    });
  }

  return result;
}

export function toOpenAITools(tools: ToolDef[]): OpenAI.ChatCompletionTool[] {
  return tools.map(
    (t): OpenAI.ChatCompletionTool => ({
      type: "function",
      function: {
        name: t.name,
        description: t.description,
        parameters: t.inputSchema,
      },
    }),
  );
}

export async function* yieldOpenAIStream(
  client: OpenAI,
  model: string,
  messages: Message[],
  tools: ToolDef[],
): AsyncIterable<Delta> {
  const stream = await client.chat.completions.create({
    model,
    messages: toOpenAIMessages(messages),
    ...(tools.length > 0 ? { tools: toOpenAITools(tools) } : {}),
    stream: true,
    stream_options: { include_usage: true },
  });

  for await (const chunk of stream) {
    if (chunk.usage) {
      yield {
        type: "usage",
        usage: {
          inputTokens: chunk.usage.prompt_tokens,
          outputTokens: chunk.usage.completion_tokens,
          cacheReadTokens: chunk.usage.prompt_tokens_details?.cached_tokens ?? 0,
          cacheWriteTokens: 0,
        },
      };
    }

    const choice = chunk.choices[0];
    if (!choice) continue;

    const delta = choice.delta;

    if (delta.content) {
      yield { type: "text", text: delta.content };
    }

    if (delta.tool_calls) {
      for (const tc of delta.tool_calls) {
        if (tc.id) {
          yield {
            type: "tool_call",
            id: tc.id,
            name: tc.function?.name ?? "",
            inputChunk: tc.function?.arguments ?? "",
          };
        } else {
          yield {
            type: "tool_call",
            id: "",
            name: "",
            inputChunk: tc.function?.arguments ?? "",
          };
        }
      }
    }

    if (choice.finish_reason === "stop" || choice.finish_reason === "tool_calls") {
      break;
    }
  }

  yield { type: "done" };
}
