import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type { McpOAuthStore, OAuthClientInformationMixed, OAuthTokens } from "@athena/tools";

type ApiKeyEntry = { type: "api_key"; key: string };
/** A stored subscription (Claude Pro/Max, ChatGPT Plus/Pro) OAuth credential. */
type OAuthEntry = {
  type: "oauth";
  access: string;
  refresh: string;
  expires: number;
  accountId?: string;
};
type AuthEntry = ApiKeyEntry | OAuthEntry;
type AuthData = Record<string, AuthEntry>;

interface RawAuthFile {
  otlpHeaders?: Record<string, string>;
  [key: string]: unknown;
}

function isAuthEntry(value: unknown): value is AuthEntry {
  if (typeof value !== "object" || value === null) return false;
  const v = value as { type?: unknown };
  if (v.type === "api_key") {
    return typeof (value as { key?: unknown }).key === "string";
  }
  if (v.type === "oauth") {
    const o = value as { access?: unknown; refresh?: unknown; expires?: unknown };
    return (
      typeof o.access === "string" && typeof o.refresh === "string" && typeof o.expires === "number"
    );
  }
  return false;
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
    const label = cred.type === "api_key" ? `${cred.key.slice(0, 8)}…` : "OAuth (subscription)";
    console.log(`  ${provider}: ${label}`);
  }
}

export function getConfiguredProviders(): string[] {
  const data = readAuthData();
  const fromFile = Object.entries(data)
    .filter(([, cred]) => (cred.type === "api_key" ? !!cred.key : !!cred.access))
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

export interface StoredOAuthCredential {
  access: string;
  refresh: string;
  expires: number;
  accountId?: string;
}

export function getOAuthCredential(provider: string): StoredOAuthCredential | undefined {
  const stored = readAuthData()[provider];
  if (stored?.type !== "oauth") return undefined;
  return {
    access: stored.access,
    refresh: stored.refresh,
    expires: stored.expires,
    ...(stored.accountId !== undefined ? { accountId: stored.accountId } : {}),
  };
}

export function setOAuthCredential(provider: string, cred: StoredOAuthCredential): void {
  writeRawAuthFile((raw) => {
    raw[provider] = { type: "oauth", ...cred } satisfies AuthEntry;
  });
}

/** Providers that support subscription (OAuth) login, mapped to their refresh function. */
type RefreshFn = (refreshToken: string) => Promise<StoredOAuthCredential>;
const OAUTH_REFRESHERS: Partial<Record<string, RefreshFn>> = {};

export function registerOAuthRefresher(provider: string, refresh: RefreshFn): void {
  OAUTH_REFRESHERS[provider] = refresh;
}

const REFRESH_SKEW_MS = 60_000;

/**
 * Resolves the credential to authenticate `provider` with: a stored OAuth
 * token (refreshed first if within a minute of expiry) if present, else a
 * stored/env API key. Refresh runs at most once per call — callers making
 * many requests in a session should resolve once and reuse.
 */
export async function resolveCredential(
  provider: string,
): Promise<{ apiKey: string; isOAuth: boolean; accountId?: string } | undefined> {
  const oauth = getOAuthCredential(provider);
  if (oauth) {
    if (Date.now() < oauth.expires - REFRESH_SKEW_MS) {
      return {
        apiKey: oauth.access,
        isOAuth: true,
        ...(oauth.accountId ? { accountId: oauth.accountId } : {}),
      };
    }
    const refresh = OAUTH_REFRESHERS[provider];
    if (!refresh) {
      throw new Error(
        `Stored OAuth credential for "${provider}" expired and no refresher registered`,
      );
    }
    const refreshed = await refresh(oauth.refresh);
    setOAuthCredential(provider, refreshed);
    return {
      apiKey: refreshed.access,
      isOAuth: true,
      ...(refreshed.accountId ? { accountId: refreshed.accountId } : {}),
    };
  }

  const apiKey = getApiKey(provider);
  return apiKey ? { apiKey, isOAuth: false } : undefined;
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
