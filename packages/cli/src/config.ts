import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type { ProviderConfig, ProviderName } from "@athena/providers";
import { getApiKey } from "./auth.js";

function configDir(): string {
  return process.env.ATHENA_CONFIG_DIR ?? join(homedir(), ".config", "athena");
}

function configPath(): string {
  return join(configDir(), "config.json");
}

export interface AthenaConfig {
  provider: ProviderName;
  model?: string;
  providerConfig: ProviderConfig;
}

interface ConfigFile {
  provider?: string;
  model?: string;
  anthropic?: { model?: string };
  ollama?: { model?: string; baseUrl?: string };
  gemini?: { model?: string };
  azure?: {
    endpoint: string;
    apiKey: string;
    deploymentName: string;
    apiVersion?: string;
  };
  bedrock?: { model?: string; region?: string };
  observability?: {
    enabled?: boolean;
    otlpEndpoint?: string;
    backendPreset?: "new-relic" | "custom";
  };
}

function readConfigFile(): ConfigFile {
  try {
    return JSON.parse(readFileSync(configPath(), "utf8")) as ConfigFile;
  } catch {
    return {};
  }
}

export function saveConfig(patch: { provider?: ProviderName; model?: string }): void {
  const dir = dirname(configPath());
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true, mode: 0o700 });

  const file = readConfigFile();
  if (patch.provider !== undefined) file.provider = patch.provider;
  if (patch.model !== undefined) {
    switch (patch.provider) {
      case "anthropic":
        file.anthropic = { ...file.anthropic, model: patch.model };
        break;
      case "gemini":
        file.gemini = { ...file.gemini, model: patch.model };
        break;
      case "ollama":
        file.ollama = { ...file.ollama, model: patch.model };
        break;
      case "bedrock":
        file.bedrock = { ...file.bedrock, model: patch.model };
        break;
      default:
        break;
    }
  }

  writeFileSync(configPath(), JSON.stringify(file, null, 2), "utf8");
}

export interface ObservabilitySettings {
  enabled: boolean;
  otlpEndpoint?: string;
  backendPreset?: "new-relic" | "custom";
}

export function loadObservabilityConfig(): ObservabilitySettings {
  const file = readConfigFile();
  return {
    enabled: file.observability?.enabled ?? false,
    ...(file.observability?.otlpEndpoint !== undefined
      ? { otlpEndpoint: file.observability.otlpEndpoint }
      : {}),
    ...(file.observability?.backendPreset !== undefined
      ? { backendPreset: file.observability.backendPreset }
      : {}),
  };
}

export function saveObservabilityConfig(patch: {
  enabled?: boolean;
  otlpEndpoint?: string;
  backendPreset?: "new-relic" | "custom";
}): void {
  const dir = dirname(configPath());
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true, mode: 0o700 });

  const file = readConfigFile();
  const observability = { ...file.observability };
  if (patch.enabled !== undefined) observability.enabled = patch.enabled;
  if (patch.otlpEndpoint !== undefined) observability.otlpEndpoint = patch.otlpEndpoint;
  if (patch.backendPreset !== undefined) observability.backendPreset = patch.backendPreset;
  file.observability = observability;

  writeFileSync(configPath(), JSON.stringify(file, null, 2), "utf8");
}

export function loadConfig(): AthenaConfig {
  const file: ConfigFile = readConfigFile();

  const provider = (file.provider ?? "anthropic") as ProviderName;

  const anthropicModel = file.anthropic?.model ?? file.model;
  const ollamaModel = file.ollama?.model ?? file.model;
  const geminiModel = file.gemini?.model ?? file.model;

  const providerConfig: ProviderConfig = {
    anthropic: {
      apiKey: getApiKey("anthropic") ?? "",
      ...(anthropicModel !== undefined ? { model: anthropicModel } : {}),
    },
    ollama: {
      ...(ollamaModel !== undefined ? { model: ollamaModel } : {}),
      ...(file.ollama?.baseUrl !== undefined ? { baseUrl: file.ollama.baseUrl } : {}),
    },
    gemini: {
      apiKey: getApiKey("gemini") ?? "",
      ...(geminiModel !== undefined ? { model: geminiModel } : {}),
    },
    bedrock: {
      apiKey: getApiKey("bedrock") ?? "",
      ...(file.bedrock?.model !== undefined ? { model: file.bedrock.model } : {}),
      ...(file.bedrock?.region !== undefined ? { region: file.bedrock.region } : {}),
    },
  };

  if (file.azure) {
    providerConfig.azure = {
      endpoint: file.azure.endpoint,
      apiKey: getApiKey("azure") ?? file.azure.apiKey,
      deployment: file.azure.deploymentName,
      ...(file.azure.apiVersion !== undefined ? { apiVersion: file.azure.apiVersion } : {}),
    };
  }

  const result: AthenaConfig = { provider, providerConfig };
  if (file.model !== undefined) result.model = file.model;
  return result;
}
