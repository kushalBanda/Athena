import { pathToFileURL } from "node:url";
import { Client, type ClientOptions } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { ListRootsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import type { McpServerConfig, McpServerStatus, McpToolDef } from "./types.ts";

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
 * Spawns and connects to a local stdio MCP server, soft-failing to a
 * `failed` status on any error — spawn failure, handshake timeout,
 * protocol error. Never throws. On failure the transport/client (if
 * created) is closed before returning.
 */
export async function connectStdioServer(config: McpServerConfig, projectRoot: string): Promise<ConnectResult> {
	if (config.enabled === false) return { status: { status: "disabled" } };

	const [command, ...args] = config.command;
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
