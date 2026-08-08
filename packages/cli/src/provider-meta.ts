import type { ProviderName } from "@athena/providers";

export interface ProviderMeta {
  readonly id: ProviderName;
  readonly label: string;
  readonly needsKey: boolean;
}

/** Single source of truth for provider display names + key requirement, shared by `setup.tsx` and `/provider`. */
export const PROVIDER_META: readonly ProviderMeta[] = [
  { id: "anthropic", label: "Anthropic (Claude)", needsKey: true },
  { id: "gemini", label: "Google Gemini", needsKey: true },
  { id: "azure", label: "Azure OpenAI", needsKey: true },
  { id: "bedrock", label: "AWS Bedrock", needsKey: true },
  { id: "ollama", label: "Ollama (local, no key)", needsKey: false },
];

export function getProviderMeta(id: ProviderName): ProviderMeta {
  const found = PROVIDER_META.find((p) => p.id === id);
  if (!found) throw new Error(`unknown provider: ${id}`);
  return found;
}
