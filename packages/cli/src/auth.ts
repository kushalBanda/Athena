import { readFileSync, writeFileSync, mkdirSync, chmodSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";

type AuthData = Record<string, { type: "api_key"; key: string }>;

const AUTH_FILE = join(homedir(), ".config", "athena", "auth.json");

const ENV_VARS: Record<string, string[]> = {
  anthropic: ["ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN"],
  ollama: [],
  gemini: ["GEMINI_API_KEY"],
  azure: ["AZURE_OPENAI_API_KEY"],
};

function readAuthFile(): AuthData {
  try {
    return JSON.parse(readFileSync(AUTH_FILE, "utf8")) as AuthData;
  } catch {
    return {};
  }
}

export function getApiKey(provider: string): string | undefined {
  const data = readAuthFile();
  const stored = data[provider];
  if (stored?.type === "api_key" && stored.key) return stored.key;

  const envVars = ENV_VARS[provider] ?? [];
  for (const envVar of envVars) {
    const val = process.env[envVar];
    if (val) return val;
  }

  return undefined;
}

export function setApiKey(provider: string, key: string): void {
  const dir = dirname(AUTH_FILE);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true, mode: 0o700 });

  const data = readAuthFile();
  data[provider] = { type: "api_key", key };

  writeFileSync(AUTH_FILE, JSON.stringify(data, null, 2), { encoding: "utf8", mode: 0o600 });
  chmodSync(AUTH_FILE, 0o600);
  console.log(`Saved ${provider} API key to ${AUTH_FILE}`);
}

export function listKeys(): void {
  const data = readAuthFile();
  const entries = Object.entries(data);
  if (entries.length === 0) {
    console.log(`No keys stored in ${AUTH_FILE}`);
    return;
  }
  for (const [provider, cred] of entries) {
    const masked = cred.key.slice(0, 8) + "…";
    console.log(`  ${provider}: ${masked}`);
  }
}

export function getConfiguredProviders(): string[] {
  const data = readAuthFile();
  const fromFile = Object.entries(data)
    .filter(([, cred]) => cred.type === "api_key" && cred.key)
    .map(([p]) => p);

  const fromEnv = Object.entries(ENV_VARS)
    .filter(([, vars]) => vars.some((v) => process.env[v]))
    .map(([p]) => p);

  return [...new Set([...fromFile, ...fromEnv])];
}

export function autoDetectProvider(): string | undefined {
  const configured = getConfiguredProviders();
  return configured[0];
}
