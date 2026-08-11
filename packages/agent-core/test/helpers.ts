import type { Delta, LLMProvider, Message, ToolDef } from "@athena/providers";
import type { AgentCallbacks } from "../src/types.js";

export function makeMockProvider(
  deltas: Delta[],
  onChat?: (messages: Message[]) => void,
): LLMProvider {
  return {
    name: "mock",
    model: "mock",
    contextLimit: 200_000,
    async *chat(messages: Message[], _tools: ToolDef[]): AsyncIterable<Delta> {
      onChat?.(messages);
      for (const d of deltas) yield d;
    },
    async countTokens(_messages: Message[]): Promise<number> {
      return 0;
    },
  };
}

/** A provider whose `chat()` throws for the first `failCount` calls, then yields `deltas`. */
export function makeFlakyProvider(failCount: number, deltas: Delta[]): LLMProvider {
  let call = 0;
  return {
    name: "mock",
    model: "mock",
    contextLimit: 200_000,
    // biome-ignore lint/correctness/useYield: intentionally throws before yielding on early calls
    async *chat(_messages: Message[], _tools: ToolDef[]): AsyncIterable<Delta> {
      call++;
      if (call <= failCount) {
        throw new Error(`transient failure #${call}`);
      }
      for (const d of deltas) yield d;
    },
    async countTokens(): Promise<number> {
      return 0;
    },
  };
}

export function makeSequentialProvider(sequence: Delta[][]): LLMProvider {
  let call = 0;
  return {
    name: "mock",
    model: "mock",
    contextLimit: 200_000,
    async *chat(_messages: Message[], _tools: ToolDef[]): AsyncIterable<Delta> {
      const deltas = sequence[call] ?? [{ type: "done" as const }];
      call++;
      for (const d of deltas) yield d;
    },
    async countTokens(): Promise<number> {
      return 0;
    },
  };
}

export function makeNoopCallbacks(): AgentCallbacks {
  return {
    onThinking: () => {},
    onAssistantToken: () => {},
    onToolCall: () => {},
    onToolResult: () => {},
    onCompacting: () => {},
    onTokenUpdate: () => {},
    onPermissionRequest: async () => true,
  };
}
