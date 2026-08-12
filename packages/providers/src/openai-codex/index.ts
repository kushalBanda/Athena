import { estimateCharsAsTokens } from "../token-estimate.js";
import type {
  Delta,
  LLMProvider,
  Message,
  ToolCallContent,
  ToolDef,
  ToolResultContent,
} from "../types.js";

const CODEX_BASE_URL = "https://chatgpt.com/backend-api/codex/responses";


interface ResponsesEvent {
  type: string;
  item?: { type?: string; id?: string; call_id?: string; name?: string; arguments?: string };
  item_id?: string;
  delta?: string;
  response?: {
    usage?: {
      input_tokens?: number;
      output_tokens?: number;
      input_tokens_details?: { cached_tokens?: number };
    };
  };
}

type CodexInputItem =
  | { role: "user" | "assistant"; content: { type: "input_text" | "output_text"; text: string }[] }
  | { type: "function_call"; call_id: string; name: string; arguments: string }
  | { type: "function_call_output"; call_id: string; output: string };

function toCodexInput(messages: Message[]): CodexInputItem[] {
  const items: CodexInputItem[] = [];

  for (const msg of messages) {
    if (msg.role === "tool") {
      for (const c of msg.content) {
        if (c.type === "tool_result") {
          const tr = c as ToolResultContent;
          items.push({ type: "function_call_output", call_id: tr.toolCallId, output: tr.content });
        }
      }
      continue;
    }

    const textParts = msg.content.filter((c) => c.type === "text");
    if (textParts.length > 0) {
      items.push({
        role: msg.role === "assistant" ? "assistant" : "user",
        content: textParts.map((c) => ({
          type: msg.role === "assistant" ? "output_text" : "input_text",
          text: c.type === "text" ? c.text : "",
        })),
      });
    }

    if (msg.role === "assistant") {
      for (const c of msg.content) {
        if (c.type === "tool_call") {
          const tc = c as ToolCallContent;
          items.push({
            type: "function_call",
            call_id: tc.id,
            name: tc.name,
            arguments: JSON.stringify(tc.input),
          });
        }
      }
    }
  }

  return items;
}

function toCodexTools(tools: ToolDef[]) {
  return tools.map((t) => ({
    type: "function" as const,
    name: t.name,
    description: t.description,
    parameters: t.inputSchema,
    strict: false,
  }));
}

async function* parseSSE(response: Response): AsyncIterable<ResponsesEvent> {
  if (!response.body) return;
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        const data = trimmed.slice(5).trim();
        if (!data || data === "[DONE]") continue;
        try {
          yield JSON.parse(data) as ResponsesEvent;
        } catch {
          // ignore malformed SSE frames
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

/**
 * Codex (ChatGPT Plus/Pro subscription) provider. Talks to the same
 * `chatgpt.com/backend-api/codex/responses` endpoint the Codex CLI uses —
 * an OpenAI Responses API variant gated behind an OAuth access token rather
 * than a billed API key. See `packages/cli/src/oauth/codex-oauth.ts` for
 * the login/refresh flow that produces the access token + account id this
 * class is constructed with.
 */
export class OpenAICodexProvider implements LLMProvider {
  readonly name = "openai-codex";
  readonly contextLimit: number;
  readonly model: string;

  private accessToken: string;
  private accountId: string;

  constructor(
    accessToken: string,
    accountId: string,
    model = "gpt-5.6-terra",
    contextLimit = 272_000,
  ) {
    this.accessToken = accessToken;
    this.accountId = accountId;
    this.model = model;
    this.contextLimit = contextLimit;
  }

  async *chat(
    messages: Message[],
    tools: ToolDef[],
    systemPrompt?: string,
    _sessionId?: string,
  ): AsyncIterable<Delta> {
    const body = {
      model: this.model,
      store: false,
      stream: true,
      instructions: systemPrompt || "You are a helpful assistant.",
      input: toCodexInput(messages),
      include: ["reasoning.encrypted_content"],
      tool_choice: "auto",
      parallel_tool_calls: true,
      ...(tools.length > 0 ? { tools: toCodexTools(tools) } : {}),
    };

    const response = await fetch(CODEX_BASE_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        "chatgpt-account-id": this.accountId,
        originator: "athena",
        "OpenAI-Beta": "responses=experimental",
        accept: "text/event-stream",
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok || !response.body) {
      const text = await response.text().catch(() => "");
      throw new Error(`Codex request failed (${response.status}): ${text || response.statusText}`);
    }

    // response.function_call_arguments.delta only carries item_id (the
    // output item's `id`) + output_index, not call_id/name — both must be
    // resolved from the response.output_item.added event that opened the
    // same item_id, or every argument delta gets silently dropped.
    const callsByItemId = new Map<string, { callId: string; name: string }>();

    for await (const event of parseSSE(response)) {
      switch (event.type) {
        case "response.output_item.added": {
          if (
            event.item?.type === "function_call" &&
            event.item.id &&
            event.item.call_id &&
            event.item.name
          ) {
            callsByItemId.set(event.item.id, { callId: event.item.call_id, name: event.item.name });
            yield {
              type: "tool_call",
              id: event.item.call_id,
              name: event.item.name,
              inputChunk: event.item.arguments ?? "",
            };
          }
          break;
        }
        case "response.output_text.delta": {
          if (event.delta) yield { type: "text", text: event.delta };
          break;
        }
        case "response.function_call_arguments.delta": {
          const call = event.item_id ? callsByItemId.get(event.item_id) : undefined;
          if (call && event.delta) {
            yield {
              type: "tool_call",
              id: call.callId,
              name: call.name,
              inputChunk: event.delta,
            };
          }
          break;
        }
        case "response.completed":
        case "response.incomplete": {
          const usage = event.response?.usage;
          if (usage) {
            const cached = usage.input_tokens_details?.cached_tokens ?? 0;
            yield {
              type: "usage",
              usage: {
                inputTokens: Math.max(0, (usage.input_tokens ?? 0) - cached),
                outputTokens: usage.output_tokens ?? 0,
                cacheReadTokens: cached,
                cacheWriteTokens: 0,
              },
            };
          }
          break;
        }
        case "response.failed":
        case "error": {
          throw new Error(`Codex stream error: ${JSON.stringify(event)}`);
        }
      }
    }

    yield { type: "done" };
  }

  // Codex's Responses API has no token-counting endpoint; fall back to the
  // same chars/4 heuristic Azure/Ollama use.
  async countTokens(messages: Message[]): Promise<number> {
    return estimateCharsAsTokens(messages);
  }
}
