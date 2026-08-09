import { AnthropicProvider } from "./anthropic/index.js";
import { AzureOpenAIProvider, type AzureConfig } from "./azure/index.js";
import { BedrockProvider, type BedrockConfig } from "./bedrock/index.js";
import type { EffortLevel } from "./effort.js";
import { GeminiProvider } from "./gemini/index.js";
import { OllamaProvider } from "./ollama/index.js";
import type { LLMProvider } from "./types.js";

export type ProviderName = "anthropic" | "ollama" | "gemini" | "azure" | "bedrock";

export interface ProviderConfig {
  anthropic?: { apiKey: string; model?: string; effort?: EffortLevel };
  ollama?: { model?: string; baseUrl?: string; apiKey?: string };
  gemini?: { apiKey: string; model?: string; effort?: EffortLevel };
  azure?: AzureConfig;
  bedrock?: BedrockConfig;
}

export function createProvider(name: ProviderName, config: ProviderConfig): LLMProvider {
  switch (name) {
    case "anthropic": {
      const c = config.anthropic;
      if (!c) throw new Error("anthropic config missing");
      return new AnthropicProvider(c.apiKey, c.model, undefined, c.effort);
    }
    case "ollama": {
      const c = config.ollama ?? {};
      return new OllamaProvider(c.model, c.baseUrl, c.apiKey);
    }
    case "gemini": {
      const c = config.gemini;
      if (!c) throw new Error("gemini config missing");
      return new GeminiProvider(c.apiKey, c.model, c.effort);
    }
    case "azure": {
      const c = config.azure;
      if (!c) throw new Error("azure config missing");
      return new AzureOpenAIProvider(c);
    }
    case "bedrock": {
      const c = config.bedrock;
      if (!c) throw new Error("bedrock config missing");
      return new BedrockProvider(c);
    }
  }
}
