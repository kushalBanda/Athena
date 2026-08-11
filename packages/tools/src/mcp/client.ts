import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { UnauthorizedError } from "@modelcontextprotocol/sdk/client/auth.js";
import type { Tool as McpToolDef } from "@modelcontextprotocol/sdk/types.js";
import type { McpServerConfig } from "./config.js";
import { McpOAuthProvider, type McpOAuthStore } from "./oauth.js";

export type McpConnectionStatus = "connected" | "failed" | "needs_auth" | "disabled";

export interface McpConnectResult {
  status: McpConnectionStatus;
  error?: string;
  client?: Client;
  tools?: McpToolDef[];
}

const DEFAULT_TIMEOUT_MS = 30_000;
const CLIENT_NAME = "athena";
const CLIENT_VERSION = "0.1.0";

function createClient(): Client {
  return new Client({ name: CLIENT_NAME, version: CLIENT_VERSION }, { capabilities: {} });
}

async function connectLocal(
  name: string,
  cfg: Extract<McpServerConfig, { type: "local" }>,
  cwd: string,
): Promise<McpConnectResult> {
  const [command, ...args] = cfg.command;
  if (!command) return { status: "failed", error: `MCP server "${name}" has an empty command` };

  const transport = new StdioClientTransport({
    command,
    args,
    cwd: cfg.cwd ? path.resolve(cwd, cfg.cwd) : cwd,
    // Full host env forwarded on purpose, same tradeoff as shell_exec
    // (packages/tools/src/impl/shell-exec.ts): a locally-spawned MCP server
    // is trusted like any other subprocess this host runs; the config itself
    // (who gets added as a local server) is the gate, not a scrubbed env.
    env: { ...(process.env as Record<string, string>), ...cfg.env },
    stderr: "pipe",
  });

  const client = createClient();
  try {
    await client.connect(transport, { timeout: cfg.timeout ?? DEFAULT_TIMEOUT_MS });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await transport.close().catch(() => {});
    return { status: "failed", error: message };
  }

  return finishConnection(name, client, cfg.timeout);
}

async function connectRemote(
  name: string,
  cfg: Extract<McpServerConfig, { type: "remote" }>,
  oauthStore: McpOAuthStore,
): Promise<McpConnectResult> {
  let url: URL;
  try {
    url = new URL(cfg.url);
  } catch {
    return { status: "failed", error: `Invalid MCP URL for "${name}": ${cfg.url}` };
  }

  const oauthDisabled = cfg.oauth === false;
  const oauthOpts = typeof cfg.oauth === "object" ? cfg.oauth : {};
  const authProvider = oauthDisabled
    ? undefined
    : new McpOAuthProvider(name, oauthStore, oauthOpts);

  const transportOpts = {
    ...(authProvider ? { authProvider } : {}),
    ...(cfg.headers ? { requestInit: { headers: cfg.headers } } : {}),
  };

  const attempts: Array<{
    label: string;
    transport: StreamableHTTPClientTransport | SSEClientTransport;
  }> = [
    { label: "StreamableHTTP", transport: new StreamableHTTPClientTransport(url, transportOpts) },
    { label: "SSE", transport: new SSEClientTransport(url, transportOpts) },
  ];

  let lastError: string | undefined;
  for (const { transport } of attempts) {
    const client = createClient();
    try {
      // The SDK's HTTP transports have a `sessionId` getter typed as
      // `string | undefined` that trips `exactOptionalPropertyTypes` against
      // the base `Transport` interface's `sessionId?: string` — an upstream
      // typing quirk, not a real incompatibility (verified: both classes
      // implement `Transport` directly). Cast through `unknown` here only.
      await client.connect(transport as unknown as Parameters<Client["connect"]>[0], {
        timeout: cfg.timeout ?? DEFAULT_TIMEOUT_MS,
      });
      return finishConnection(name, client, cfg.timeout);
    } catch (error) {
      await transport.close().catch(() => {});
      if (error instanceof UnauthorizedError) {
        return { status: "needs_auth", error: "Authentication required" };
      }
      lastError = error instanceof Error ? error.message : String(error);
    }
  }

  return { status: "failed", error: lastError ?? "Failed to connect to remote MCP server" };
}

async function finishConnection(
  name: string,
  client: Client,
  timeout?: number,
): Promise<McpConnectResult> {
  try {
    const listed = await client.listTools(undefined, { timeout: timeout ?? DEFAULT_TIMEOUT_MS });
    return { status: "connected", client, tools: listed.tools };
  } catch (error) {
    await client.close().catch(() => {});
    const message = error instanceof Error ? error.message : String(error);
    return {
      status: "failed",
      error: `MCP server "${name}" connected but listTools() failed: ${message}`,
    };
  }
}

/**
 * Connects to a single MCP server given its config. Never throws — failures
 * surface via `McpConnectResult.status`/`error` so a caller iterating over
 * many servers can treat each independently.
 */
export async function connectMcpServer(
  name: string,
  cfg: McpServerConfig,
  opts: { cwd: string; oauthStore: McpOAuthStore },
): Promise<McpConnectResult> {
  if (cfg.enabled === false) return { status: "disabled" };

  try {
    return cfg.type === "local"
      ? await connectLocal(name, cfg, opts.cwd)
      : await connectRemote(name, cfg, opts.oauthStore);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { status: "failed", error: message };
  }
}
