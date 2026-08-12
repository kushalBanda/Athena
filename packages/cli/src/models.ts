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
  // Current Codex generation is the gpt-5.6 three-tier lineup (sol =
  // detail/polish for hard tasks, terra = everyday workhorse/default,
  // luna = fast + cheap for repeatable work), replacing gpt-5.4 (retiring
  // end of August 2026). gpt-5.1-codex/-mini kept since they're still live
  // in the API catalog for accounts pinned to older configs. 
  "openai-codex": [
    "gpt-5.6-terra",
    "gpt-5.6-sol",
    "gpt-5.6-luna",
    "gpt-5.4",
    "gpt-5.4-mini",
    "gpt-5.1-codex",
    "gpt-5.1-codex-mini",
  ],
};

export const PROVIDER_CATALOG: ProviderName[] = [
  "anthropic",
  "gemini",
  "azure",
  "ollama",
  "bedrock",
  "openai-codex",
];
