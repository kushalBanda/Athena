import { BEDROCK_MODEL_IDS, type ProviderName } from "@athena/providers";

export const MODEL_CATALOG: Record<ProviderName, string[]> = {
  anthropic: [
    "claude-opus-5",
    "claude-sonnet-5",
    "claude-fable-5",
    "claude-haiku-4-5-20251001",
    "claude-sonnet-4-6",
  ],
  gemini: ["gemini-2.5-pro", "gemini-2.5-flash"],
  ollama: ["llama3.1", "qwen2.5-coder", "deepseek-coder-v2", "mistral"],
  azure: [],
  bedrock: [...BEDROCK_MODEL_IDS],
};

export const PROVIDER_CATALOG: ProviderName[] = [
  "anthropic",
  "gemini",
  "azure",
  "ollama",
  "bedrock",
];
