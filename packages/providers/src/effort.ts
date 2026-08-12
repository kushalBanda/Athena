import type { ProviderName } from "./factory.js";

export type EffortLevel = "low" | "medium" | "high" | "xhigh" | "max";

export const EFFORT_LEVELS: readonly EffortLevel[] = ["low", "medium", "high", "xhigh", "max"];

export const PROVIDER_EFFORT_LEVELS: Record<ProviderName, readonly EffortLevel[]> = {
  anthropic: EFFORT_LEVELS,
  gemini: EFFORT_LEVELS,
  azure: ["low", "medium", "high"],
  bedrock: [],
  ollama: [],
  // Codex's Responses API supports reasoning.effort, not wired up yet.
  "openai-codex": [],
};

export const THINKING_BUDGET_TOKENS: Record<EffortLevel, number> = {
  low: 1024,
  medium: 4096,
  high: 8192,
  xhigh: 16384,
  max: 32768,
};

export function supportsEffort(provider: ProviderName): boolean {
  return PROVIDER_EFFORT_LEVELS[provider].length > 0;
}
