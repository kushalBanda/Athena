import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import type { CredentialStore, OAuthCredential, ProviderAuthInteraction } from "@kushalbanda/ai";
import type { ToolDefinition } from "../extensions/types.ts";
import { connectHttpServer, connectStdioServer } from "./client.ts";
import { createMcpOAuthAuth, isCredentialExpired, mcpOAuthProviderId } from "./oauth.ts";
import { convertMcpTool } from "./tool-bridge.ts";
import type { McpHttpServerConfig, McpServerConfig, McpServerStatus, McpUserServerConfig } from "./types.ts";

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
			type: "stdio",
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

function isHttpConfig(config: McpServerConfig): config is McpHttpServerConfig {
	return config.type === "http" || config.type === "sse";
}

/**
 * Merge built-in servers with user-declared ones from settings; user entries
 * win on name collision. `disabledBuiltins` turns off a built-in that has no
 * settings entry of its own (there's nothing to override, so it's tracked
 * separately — see `SettingsManager.setMcpBuiltinEnabled`).
 */
function resolveServers(
	userServers: Record<string, McpUserServerConfig> | undefined,
	disabledBuiltins: ReadonlySet<string>,
): McpServerConfig[] {
	const byName = new Map<string, McpServerConfig>();
	for (const server of builtInServers()) {
		byName.set(server.name, disabledBuiltins.has(server.name) ? { ...server, enabled: false } : server);
	}
	for (const [name, config] of Object.entries(userServers ?? {})) {
		byName.set(name, { ...config, name } as McpServerConfig);
	}
	return Array.from(byName.values());
}

interface RegistryEntry {
	status: McpServerStatus;
	tools: Record<string, ToolDefinition>;
	close: () => Promise<void>;
}

export interface McpRegistryOptions {
	/** Reads the current user-declared servers (settings `mcpServers`, name → config). Re-read on every connect(). */
	getUserServers?: () => Record<string, McpUserServerConfig> | undefined;
	/** Reads names of built-in servers turned off from the /mcp UI. Re-read on every connect(). */
	getDisabledBuiltinServers?: () => string[] | undefined;
	/** Credential storage for OAuth-enabled HTTP servers, keyed by `mcp:<server>`. Required to use OAuth or /mcp login. */
	authStorage?: CredentialStore;
}

/**
 * Session-scoped MCP client manager. Connects all built-in and user-configured
 * servers fire-and-forget (never blocks the caller), and exposes their
 * discovered tools once connected. Soft-fails per-server — one server failing
 * to connect never affects another, and never throws into the caller.
 */
export class McpRegistry {
	private entries: Map<string, RegistryEntry> = new Map();
	private connectPromise: Promise<void> | null = null;
	private readonly projectRoot: string;
	private readonly getUserServers: () => Record<string, McpUserServerConfig> | undefined;
	private readonly getDisabledBuiltinServers: () => string[] | undefined;
	private readonly authStorage?: CredentialStore;
	private resolvedServers: McpServerConfig[] = [];

	constructor(projectRoot: string, options: McpRegistryOptions = {}) {
		this.projectRoot = projectRoot;
		this.getUserServers = options.getUserServers ?? (() => undefined);
		this.getDisabledBuiltinServers = options.getDisabledBuiltinServers ?? (() => undefined);
		this.authStorage = options.authStorage;
	}

	/** Kicks off connecting all servers. Safe to call once; idempotent. */
	connect(): Promise<void> {
		if (this.connectPromise) return this.connectPromise;
		this.connectPromise = this.connectAll();
		return this.connectPromise;
	}

	/** Re-reads settings and reconnects every server. Use after settings change (e.g. post-login). */
	async refresh(): Promise<void> {
		await this.disconnectAll();
		this.connectPromise = null;
		await this.connect();
	}

	private async resolveHttpAuthHeaders(config: McpHttpServerConfig): Promise<Record<string, string> | undefined> {
		if (config.bearerTokenEnvVar) {
			const token = process.env[config.bearerTokenEnvVar]?.trim();
			if (!token) throw new Error(`Env var ${config.bearerTokenEnvVar} is not set`);
			return { Authorization: `Bearer ${token}` };
		}
		if (!config.oauth) return undefined;
		if (!this.authStorage) throw new Error(`${config.name} requires OAuth but no credential storage is configured`);

		const providerId = mcpOAuthProviderId(config.name);
		const stored = await this.authStorage.read(providerId);
		if (!stored || stored.type !== "oauth") {
			throw new Error(`Not logged in to ${config.name}; run /mcp login ${config.name}`);
		}
		let credential: OAuthCredential = stored;
		if (isCredentialExpired(credential)) {
			const auth = createMcpOAuthAuth({ server: config.name, url: config.url });
			const refreshed = await this.authStorage.modify(providerId, async (current) => {
				if (!current || current.type !== "oauth") return current;
				if (!isCredentialExpired(current)) return current;
				return auth.refresh(current, AbortSignal.timeout(30_000));
			});
			if (!refreshed || refreshed.type !== "oauth") {
				throw new Error(`Failed to refresh credentials for ${config.name}`);
			}
			credential = refreshed;
		}
		return { Authorization: `Bearer ${credential.access}` };
	}

	private async connectAll(): Promise<void> {
		const servers = resolveServers(this.getUserServers(), new Set(this.getDisabledBuiltinServers() ?? []));
		this.resolvedServers = servers;
		await Promise.all(
			servers.map(async (config) => {
				try {
					const result = isHttpConfig(config)
						? await connectHttpServer(config, await this.resolveHttpAuthHeaders(config), this.projectRoot)
						: await connectStdioServer(config, this.projectRoot);
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
				} catch (error) {
					const message = error instanceof Error ? error.message : String(error);
					this.entries.set(config.name, {
						status: { status: "failed", error: message },
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

	/** Status plus config metadata for the `/mcp` list command. */
	listServers(): Array<{
		name: string;
		status: McpServerStatus;
		transport: "stdio" | "http" | "sse";
		usesOAuth: boolean;
		/** "user" servers are fully settings-owned (toggle by patching their `mcpServers` entry);
		 * "built-in" servers (e.g. codegraph) have no settings entry, so they're toggled via
		 * `SettingsManager.setMcpBuiltinEnabled` instead. */
		origin: "built-in" | "user";
	}> {
		const userServerNames = new Set(Object.keys(this.getUserServers() ?? {}));
		return this.resolvedServers.map((config) => ({
			name: config.name,
			status: this.entries.get(config.name)?.status ?? { status: "disabled" },
			transport: config.type ?? "stdio",
			usesOAuth: isHttpConfig(config) && config.oauth === true,
			origin: userServerNames.has(config.name) ? "user" : "built-in",
		}));
	}

	/** Runs the OAuth login flow for a user-configured HTTP server and stores the resulting credential. */
	async login(server: string, interaction: ProviderAuthInteraction): Promise<void> {
		if (!this.authStorage) throw new Error("No credential storage configured for MCP login");
		const config = this.resolvedServers.find((s) => s.name === server);
		if (!config || !isHttpConfig(config)) {
			throw new Error(`Unknown MCP server: ${server}`);
		}
		if (!config.oauth) {
			throw new Error(`${server} is not configured for OAuth login (set "oauth": true in mcpServers)`);
		}
		const auth = createMcpOAuthAuth({ server, url: config.url });
		const credential: OAuthCredential = await auth.login(interaction);
		await this.authStorage.modify(mcpOAuthProviderId(server), async () => credential);
	}

	/** Removes stored OAuth credentials for a server. */
	async logout(server: string): Promise<void> {
		if (!this.authStorage) throw new Error("No credential storage configured for MCP login");
		await this.authStorage.delete(mcpOAuthProviderId(server));
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
