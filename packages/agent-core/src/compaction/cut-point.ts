import type { AgentMessage, CutPointResult } from "../types.js";
import { estimateTokens } from "./estimate.js";

function isValidCutPoint(msg: AgentMessage): boolean {
  return msg.role === "user" || msg.role === "assistant";
}

function isMidToolSequence(messages: AgentMessage[], idx: number): boolean {
  const msg = messages[idx]!;
  if (msg.role !== "user") return false;
  const prev = messages[idx - 1];
  if (!prev) return false;
  const prevContent = Array.isArray(prev.content) ? prev.content : [];
  return prevContent.some((b) => b.type === "tool_call");
}

export function findCutPoint(messages: AgentMessage[], keepRecentTokens: number): CutPointResult {
  let accumulated = 0;
  let cutIndex = 0;

  for (let i = messages.length - 1; i >= 0; i--) {
    accumulated += estimateTokens(messages[i]!);
    if (accumulated > keepRecentTokens) {
      cutIndex = i + 1;
      break;
    }
  }

  cutIndex = Math.max(cutIndex, 1);

  while (cutIndex < messages.length && !isValidCutPoint(messages[cutIndex]!)) {
    cutIndex++;
  }

  const isSplitTurn = cutIndex < messages.length && isMidToolSequence(messages, cutIndex);

  return { cutIndex, isSplitTurn };
}
