export interface ModelPricing {
  readonly inputPerM: number; // $ per 1M input tokens
  readonly outputPerM: number; // $ per 1M output tokens
}

interface PricingEntry {
  readonly match: string; // lowercase substring matched against the model name
  readonly pricing: ModelPricing;
}

const PRICING: readonly PricingEntry[] = [
  { match: "claude-opus-5", pricing: { inputPerM: 15, outputPerM: 75 } },
  { match: "claude-sonnet-5", pricing: { inputPerM: 3, outputPerM: 15 } },
  { match: "claude-haiku-4-5", pricing: { inputPerM: 0.8, outputPerM: 4 } },
  { match: "claude-fable-5", pricing: { inputPerM: 3, outputPerM: 15 } },
  { match: "gpt-5", pricing: { inputPerM: 5, outputPerM: 15 } },
  { match: "gpt-4o", pricing: { inputPerM: 2.5, outputPerM: 10 } },
  { match: "gemini-2.5-pro", pricing: { inputPerM: 1.25, outputPerM: 10 } },
  { match: "gemini-2.5-flash", pricing: { inputPerM: 0.3, outputPerM: 2.5 } },
  // Bedrock model ids (e.g. "anthropic.claude-sonnet-4-6-v1") match the existing
  // claude-* entries above via substring — AWS docs: pricing is identical
  // across bedrock-mantle/-runtime and native Anthropic per-token price.
  { match: "claude-sonnet-4-6", pricing: { inputPerM: 3, outputPerM: 15 } },
];

export function estimateCost(
  model: string,
  inputTokens: number,
  outputTokens: number,
): number | undefined {
  const lower = model.toLowerCase();
  const entry = PRICING.find((e) => lower.includes(e.match));
  if (!entry) return undefined;

  return (
    (inputTokens / 1_000_000) * entry.pricing.inputPerM +
    (outputTokens / 1_000_000) * entry.pricing.outputPerM
  );
}
