import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type { McpOAuthStore, OAuthClientInformationMixed, OAuthTokens } from "@athena/tools";

type AuthEntry = { type: "api_key"; key: string };
type AuthData = Record<string, AuthEntry>;

interface RawAuthFile {
  otlpHeaders?: Record<string, string>;
  [key: string]: unknown;
}

function isAuthEntry(value: unknown): value is AuthEntry {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { type?: unknown }).type === "api_key" &&
    typeof (value as { key?: unknown }).key === "string"
  );
}

function authDir(): string {
  return process.env.ATHENA_CONFIG_DIR ?? join(homedir(), ".config", "athena");
}

function authFilePath(): string {
  return join(authDir(), "auth.json");
}

const ENV_VARS: Record<string, string[]> = {
  anthropic: ["ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN"],
  ollama: [],
  gemini: ["GEMINI_API_KEY"],
  azure: ["AZURE_OPENAI_API_KEY"],
  bedrock: ["AWS_BEARER_TOKEN_BEDROCK"],
};

function readRawAuthFile(): RawAuthFile {
  try {
    return JSON.parse(readFileSync(authFilePath(), "utf8")) as RawAuthFile;
  } catch {
    return {};
  }
}

function readAuthData(): AuthData {
  const raw = readRawAuthFile();
  const data: AuthData = {};
  for (const [key, value] of Object.entries(raw)) {
    if (key === "otlpHeaders") continue;
    if (isAuthEntry(value)) data[key] = value;
  }
  return data;
}

function writeRawAuthFile(mutate: (raw: RawAuthFile) => void): void {
  const dir = dirname(authFilePath());
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true, mode: 0o700 });

  const raw = readRawAuthFile();
  mutate(raw);

  writeFileSync(authFilePath(), JSON.stringify(raw, null, 2), { encoding: "utf8", mode: 0o600 });
  chmodSync(authFilePath(), 0o600);
}

export function getApiKey(provider: string): string | undefined {
  const data = readAuthData();
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
  writeRawAuthFile((raw) => {
    raw[provider] = { type: "api_key", key } satisfies AuthEntry;
  });
  console.log(`Saved ${provider} API key to ${authFilePath()}`);
}

export function listKeys(): void {
  const data = readAuthData();
  const entries = Object.entries(data);
  if (entries.length === 0) {
    console.log(`No keys stored in ${authFilePath()}`);
    return;
  }
  for (const [provider, cred] of entries) {
    const masked = cred.key.slice(0, 8) + "…";
    console.log(`  ${provider}: ${masked}`);
  }
}

export function getConfiguredProviders(): string[] {
  const data = readAuthData();
  const fromFile = Object.entries(data)
    .filter(([, cred]) => !!cred.key)
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

export function getOtlpHeaders(): Record<string, string> | undefined {
  return readRawAuthFile().otlpHeaders;
}

export function setOtlpHeaders(headers: Record<string, string>): void {
  writeRawAuthFile((raw) => {
    raw.otlpHeaders = headers;
  });
  console.log(`Saved OTLP headers to ${authFilePath()}`);
}

interface McpOAuthEntry {
  clientInformation?: OAuthClientInformationMixed;
  tokens?: OAuthTokens;
  codeVerifier?: string;
}

function readMcpOAuthData(): Record<string, McpOAuthEntry> {
  const raw = readRawAuthFile().mcpOAuth;
  return typeof raw === "object" && raw !== null ? (raw as Record<string, McpOAuthEntry>) : {};
}

function writeMcpOAuthEntry(serverName: string, patch: Partial<McpOAuthEntry>): void {
  writeRawAuthFile((raw) => {
    const existing = readMcpOAuthData();
    raw.mcpOAuth = { ...existing, [serverName]: { ...existing[serverName], ...patch } };
  });
}

/**
 * `McpOAuthStore` backed by `auth.json` (0600, same file as provider API
 * keys) so a completed OAuth flow survives across `athena mcp` process
 * invocations — each CLI subcommand runs as a fresh process, so an
 * in-memory-only store never observes its own writes from a prior command.
 */
export class FileMcpOAuthStore implements McpOAuthStore {
  getClientInformation(serverName: string) {
    return readMcpOAuthData()[serverName]?.clientInformation;
  }
  saveClientInformation(serverName: string, info: OAuthClientInformationMixed) {
    writeMcpOAuthEntry(serverName, { clientInformation: info });
  }
  getTokens(serverName: string) {
    return readMcpOAuthData()[serverName]?.tokens;
  }
  saveTokens(serverName: string, tokens: OAuthTokens) {
    writeMcpOAuthEntry(serverName, { tokens });
  }
  getCodeVerifier(serverName: string) {
    return readMcpOAuthData()[serverName]?.codeVerifier;
  }
  saveCodeVerifier(serverName: string, verifier: string) {
    writeMcpOAuthEntry(serverName, { codeVerifier: verifier });
  }
}
