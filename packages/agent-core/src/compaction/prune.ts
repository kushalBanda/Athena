import type { AgentMessage, ContentBlock } from "../types.js";
import { estimateTokens } from "./estimate.js";

export const PRUNE_PROTECT_TOKENS = 40_000;
export const PRUNE_MINIMUM_GAIN = 20_000;

const PRUNED_MARKER = "[output pruned]";

function pruneMessage(msg: AgentMessage): AgentMessage {
  if (typeof msg.content === "string") return msg;
  const pruned = msg.content.map((block): ContentBlock => {
    if (block.type === "tool_result") {
      return { ...block, content: PRUNED_MARKER };
    }
    return block;
  });
  return { ...msg, content: pruned };
}

export function pruneToolOutputs(messages: AgentMessage[]): AgentMessage[] {
  let protectedTokens = 0;
  let protectFromIdx = messages.length;

  for (let i = messages.length - 1; i >= 0; i--) {
    protectedTokens += estimateTokens(messages[i]!);
    if (protectedTokens >= PRUNE_PROTECT_TOKENS) {
      protectFromIdx = i + 1;
      break;
    }
  }

  let gain = 0;
  const pruned = messages.map((msg, idx) => {
    if (idx >= protectFromIdx) return msg;
    const hasPrunableOutput =
      Array.isArray(msg.content) && msg.content.some((b) => b.type === "tool_result");
    if (!hasPrunableOutput) return msg;

    const before = estimateTokens(msg);
    const prunedMsg = pruneMessage(msg);
    gain += before - estimateTokens(prunedMsg);
    return prunedMsg;
  });

  if (gain < PRUNE_MINIMUM_GAIN) return messages;
  return pruned;
}
