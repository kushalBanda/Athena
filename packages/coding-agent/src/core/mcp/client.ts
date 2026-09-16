import { pathToFileURL } from "node:url";
import { Client, type ClientOptions } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { ListRootsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import type { McpHttpServerConfig, McpServerStatus, McpStdioServerConfig, McpToolDef } from "./types.ts";

const DEFAULT_TIMEOUT_MS = 30_000;

const CLIENT_OPTIONS: ClientOptions = {
	capabilities: { roots: {} },
};

export interface ConnectedMcpServer {
	client: Client;
	tools: McpToolDef[];
}

export interface ConnectResult {
	status: McpServerStatus;
	server?: ConnectedMcpServer;
}

function createClient(directory: string): Client {
	const client = new Client({ name: "athena", version: "1.0.0" }, CLIENT_OPTIONS);
	client.setRequestHandler(ListRootsRequestSchema, () =>
		Promise.resolve({ roots: [{ uri: pathToFileURL(directory).href }] }),
	);
	return client;
}

/**
 * Normalizes the two accepted stdio shapes into `{ command, args }`:
 * a single argv array (`["npx", "pkg"]`), or the separate `command` + `args`
 * fields used by Claude Desktop / Cursor / VS Code (`command: "npx", args: ["pkg"]`).
 */
export function normalizeStdioCommand(config: Pick<McpStdioServerConfig, "command" | "args">): {
	command: string | undefined;
	args: string[];
} {
	const [command, ...argv] = Array.isArray(config.command) ? config.command : [config.command];
	return { command, args: [...argv, ...(config.args ?? [])] };
}

/**
 * Spawns and connects to a local stdio MCP server, soft-failing to a
 * `failed` status on any error — spawn failure, handshake timeout,
 * protocol error. Never throws. On failure the transport/client (if
 * created) is closed before returning.
 */
export async function connectStdioServer(config: McpStdioServerConfig, projectRoot: string): Promise<ConnectResult> {
	if (config.enabled === false) return { status: { status: "disabled" } };

	const { command, args } = normalizeStdioCommand(config);
	if (!command) return { status: { status: "failed", error: "empty command" } };

	const transport = new StdioClientTransport({
		command,
		args,
		cwd: config.cwd ?? projectRoot,
		env: { ...process.env, ...config.env } as Record<string, string>,
		stderr: "pipe",
	});

	const client = createClient(projectRoot);
	const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;

	try {
		await withDeadline(client.connect(transport), timeoutMs);
	} catch (error) {
		await transport.close().catch(() => {});
		const message = error instanceof Error ? error.message : String(error);
		return { status: { status: "failed", error: message } };
	}

	try {
		const listed = await withDeadline(client.listTools(undefined, { timeout: timeoutMs }), timeoutMs);
		return {
			status: { status: "connected" },
			server: { client, tools: listed.tools as McpToolDef[] },
		};
	} catch (error) {
		await client.close().catch(() => {});
		const message = error instanceof Error ? error.message : String(error);
		return { status: { status: "failed", error: message } };
	}
}

/**
 * Connects to a remote HTTP MCP server (Streamable HTTP, or legacy SSE for
 * `type: "sse"`), soft-failing to a `failed` status the same way
 * {@link connectStdioServer} does. `headers` carries resolved auth (a static
 * bearer token or a fresh OAuth access token) — the caller resolves it so
 * this function stays free of credential storage concerns.
 */
export async function connectHttpServer(
	config: McpHttpServerConfig,
	headers: Record<string, string> | undefined,
	projectRoot: string,
): Promise<ConnectResult> {
	if (config.enabled === false) return { status: { status: "disabled" } };

	let url: URL;
	try {
		url = new URL(config.url);
	} catch {
		return { status: { status: "failed", error: `invalid url: ${config.url}` } };
	}

	const requestInit: RequestInit = { headers: { ...config.headers, ...headers } };
	const transport =
		config.type === "sse"
			? new SSEClientTransport(url, { requestInit })
			: new StreamableHTTPClientTransport(url, { requestInit });

	const client = createClient(projectRoot);
	const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;

	try {
		await withDeadline(client.connect(transport), timeoutMs);
	} catch (error) {
		await transport.close().catch(() => {});
		const message = error instanceof Error ? error.message : String(error);
		return { status: { status: "failed", error: message } };
	}

	try {
		const listed = await withDeadline(client.listTools(undefined, { timeout: timeoutMs }), timeoutMs);
		return {
			status: { status: "connected" },
			server: { client, tools: listed.tools as McpToolDef[] },
		};
	} catch (error) {
		await client.close().catch(() => {});
		const message = error instanceof Error ? error.message : String(error);
		return { status: { status: "failed", error: message } };
	}
}

function withDeadline<T>(promise: Promise<T>, ms: number): Promise<T> {
	return new Promise((resolve, reject) => {
		const timer = setTimeout(() => reject(new Error(`MCP call timed out after ${ms}ms`)), ms);
		promise.then(
			(value) => {
				clearTimeout(timer);
				resolve(value);
			},
			(error) => {
				clearTimeout(timer);
				reject(error);
			},
		);
	});
}
