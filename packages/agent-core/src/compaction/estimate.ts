import type { AgentMessage, ContextUsageEstimate, TokenUsage } from "../types.js";

function charsToTokens(chars: number): number {
  return Math.ceil(chars / 4);
}

function messageChars(msg: AgentMessage): number {
  if (typeof msg.content === "string") return msg.content.length;
  return msg.content.reduce((sum, block) => {
    if (block.type === "text") return sum + block.text.length;
    if (block.type === "tool_call") return sum + JSON.stringify(block.input).length + block.name.length;
    if (block.type === "tool_result") return sum + block.content.length;
    return sum;
  }, 0);
}

export function estimateTokens(msg: AgentMessage): number {
  return charsToTokens(messageChars(msg));
}

export function estimateContextTokens(messages: AgentMessage[]): ContextUsageEstimate {
  let lastUsageIdx = -1;
  let lastUsage: TokenUsage | undefined;

  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]!;
    if (m.usage) {
      lastUsageIdx = i;
      lastUsage = m.usage;
      break;
    }
  }

  if (lastUsageIdx === -1 || !lastUsage) {
    const tokens = messages.reduce((sum, m) => sum + estimateTokens(m), 0);
    return { tokens, hasRealUsage: false };
  }

  const baseTokens = lastUsage.totalTokens || lastUsage.input + lastUsage.output;
  let trailingTokens = 0;
  for (let i = lastUsageIdx + 1; i < messages.length; i++) {
    trailingTokens += estimateTokens(messages[i]!);
  }

  return { tokens: baseTokens + trailingTokens, hasRealUsage: true };
}
