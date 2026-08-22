import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import type { ToolDefinition } from "../extensions/types.ts";
import { connectStdioServer } from "./client.ts";
import { convertMcpTool } from "./tool-bridge.ts";
import type { McpServerConfig, McpServerStatus } from "./types.ts";

const require = createRequire(import.meta.url);

/** Resolves CodeGraph's installed CLI script path, or `null` if not installed. */
function resolveCodegraphBinPath(): string | null {
	try {
		const pkgJsonPath = require.resolve("@colbymchenry/codegraph/package.json");
		const pkg = require(pkgJsonPath) as { bin?: Record<string, string> };
		const binRelative = pkg.bin?.codegraph;
		if (!binRelative) return null;
		return join(dirname(pkgJsonPath), binRelative);
	} catch {
		return null;
	}
}

// Test-only override so unit tests can inject fake server configs instead of
// spawning a real MCP server. Without it, ATHENA_MCP_TEST_DISCOVERY_DISABLED
// (set for the whole suite in vitest.config.ts) disables auto-discovery
// entirely — otherwise every test that constructs an AgentSession would spawn
// a real `codegraph serve --mcp` child process, which is both slow and
// unrelated to what those tests are checking.
let builtInServersOverrideActive = false;
let builtInServersOverrideValue: McpServerConfig[] = [];

export function setBuiltInMcpServersOverrideForTests(servers: McpServerConfig[]): void {
	builtInServersOverrideActive = true;
	builtInServersOverrideValue = servers;
}

export function clearBuiltInMcpServersOverrideForTests(): void {
	builtInServersOverrideActive = false;
	builtInServersOverrideValue = [];
}

/** Built-in server list. CodeGraph is the sole entry today; more can be added the same way later. */
function builtInServers(): McpServerConfig[] {
	if (builtInServersOverrideActive) return builtInServersOverrideValue;
	if (process.env.ATHENA_MCP_TEST_DISCOVERY_DISABLED) return [];

	const binPath = resolveCodegraphBinPath();
	if (!binPath) return [];
	return [
		{
			name: "codegraph",
			command: [process.execPath, binPath, "serve", "--mcp"],
			enabled: !isCodegraphDisabledByEnv(),
		},
	];
}

function isCodegraphDisabledByEnv(): boolean {
	const value = process.env.ATHENA_CODEGRAPH;
	if (!value) return false;
	const normalized = value.trim().toLowerCase();
	return normalized === "off" || normalized === "0" || normalized === "false";
}

interface RegistryEntry {
	status: McpServerStatus;
	tools: Record<string, ToolDefinition>;
	close: () => Promise<void>;
}

/**
 * Session-scoped MCP client manager. Connects all built-in servers
 * fire-and-forget (never blocks the caller), and exposes their discovered
 * tools once connected. Soft-fails per-server — one server failing to
 * connect never affects another, and never throws into the caller.
 */
export class McpRegistry {
	private entries: Map<string, RegistryEntry> = new Map();
	private connectPromise: Promise<void> | null = null;
	private readonly projectRoot: string;

	constructor(projectRoot: string) {
		this.projectRoot = projectRoot;
	}

	/** Kicks off connecting all built-in servers. Safe to call once; idempotent. */
	connect(): Promise<void> {
		if (this.connectPromise) return this.connectPromise;
		this.connectPromise = this.connectAll();
		return this.connectPromise;
	}

	private async connectAll(): Promise<void> {
		const servers = builtInServers();
		await Promise.all(
			servers.map(async (config) => {
				try {
					const result = await connectStdioServer(config, this.projectRoot);
					if (!result.server) {
						this.entries.set(config.name, { status: result.status, tools: {}, close: async () => {} });
						return;
					}
					const { client, tools: mcpTools } = result.server;
					const tools: Record<string, ToolDefinition> = {};
					for (const def of mcpTools) {
						const tool = convertMcpTool(config.name, def, client, config.timeoutMs);
						tools[tool.name] = tool;
					}
					this.entries.set(config.name, {
						status: result.status,
						tools,
						close: () => client.close().catch(() => {}),
					});
				} catch {
					this.entries.set(config.name, {
						status: { status: "failed", error: "unexpected connect error" },
						tools: {},
						close: async () => {},
					});
				}
			}),
		);
	}

	/** All tools discovered across connected servers, keyed by their bridged name. */
	getTools(): Record<string, ToolDefinition> {
		const all: Record<string, ToolDefinition> = {};
		for (const entry of this.entries.values()) {
			Object.assign(all, entry.tools);
		}
		return all;
	}

	getStatus(): Record<string, McpServerStatus> {
		const status: Record<string, McpServerStatus> = {};
		for (const [name, entry] of this.entries) {
			status[name] = entry.status;
		}
		return status;
	}

	/** Closes our client connections. Does NOT kill the underlying server process
	 * — CodeGraph's MCP server intentionally runs as a persistent daemon shared
	 * across sessions; only our own stdio connection to it is ours to close. */
	async disconnectAll(): Promise<void> {
		await Promise.all(Array.from(this.entries.values()).map((entry) => entry.close()));
		this.entries.clear();
		this.connectPromise = null;
	}
}
