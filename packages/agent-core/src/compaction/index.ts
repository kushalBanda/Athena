import type { LLMProvider } from "@athena/providers";
import type { AgentMessage, CompactionResult, CompactionSettings } from "../types.js";
import { estimateContextTokens } from "./estimate.js";
import { findCutPoint } from "./cut-point.js";
import { pruneToolOutputs } from "./prune.js";
import { generateSummary } from "./summarize.js";
import { extractFileOps } from "./file-ops.js";

export const DEFAULT_COMPACTION_SETTINGS: CompactionSettings = {
  enabled: true,
  reserveTokens: 16_384,
  keepRecentTokens: 20_000,
};

export function shouldCompact(
  contextTokens: number,
  contextWindow: number,
  settings: CompactionSettings,
): boolean {
  if (!settings.enabled) return false;
  return contextTokens > contextWindow - settings.reserveTokens;
}

function findPriorSummary(messages: AgentMessage[]): string | undefined {
  for (const msg of messages) {
    if (msg.role === "compaction_summary") {
      return typeof msg.content === "string" ? msg.content : undefined;
    }
  }
  return undefined;
}

export async function compact(
  messages: AgentMessage[],
  settings: CompactionSettings,
  provider: LLMProvider,
): Promise<CompactionResult> {
  const { tokens: tokensBefore } = estimateContextTokens(messages);

  const pruned = pruneToolOutputs(messages);

  const { cutIndex } = findCutPoint(pruned, settings.keepRecentTokens);

  const toSummarize = pruned.slice(0, cutIndex);
  const retainedTail = pruned.slice(cutIndex);

  const priorSummary = findPriorSummary(toSummarize);
  const summary = await generateSummary(toSummarize, provider, priorSummary);

  const fileOps = extractFileOps(toSummarize);
  const firstKeptMessageId = retainedTail[0]?.id ?? "";

  return {
    summary,
    firstKeptMessageId,
    tokensBefore,
    retainedTail,
    fileOps,
  };
}
