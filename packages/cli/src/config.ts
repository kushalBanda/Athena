import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import type { ProviderName, ProviderConfig } from "@athena/providers";
import { getApiKey } from "./auth.js";

const CONFIG_PATH = join(homedir(), ".config", "athena", "config.json");

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
}

function readConfigFile(): ConfigFile {
  try {
    return JSON.parse(readFileSync(CONFIG_PATH, "utf8")) as ConfigFile;
  } catch {
    return {};
  }
}

/** Persists provider + per-provider model choice so it survives restarts. */
export function saveConfig(patch: { provider?: ProviderName; model?: string }): void {
  const dir = dirname(CONFIG_PATH);
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
      default:
        break; // azure model lives in deploymentName, not settable via /model
    }
  }

  writeFileSync(CONFIG_PATH, JSON.stringify(file, null, 2), "utf8");
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
