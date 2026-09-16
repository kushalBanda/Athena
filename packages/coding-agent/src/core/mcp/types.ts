/**
 * A local subprocess MCP server, spawned over stdio. `command` accepts either
 * a single argv array (`["npx", "@playwright/mcp@latest"]`) or the separate
 * `command` + `args` shape used by Claude Desktop / Cursor / VS Code
 * (`command: "npx", args: ["@playwright/mcp@latest"]`) — both are common in
 * the wild, so both are accepted.
 */
export interface McpStdioServerConfig {
	type?: "stdio";
	name: string;
	command: string | string[];
	args?: string[];
	cwd?: string;
	env?: Record<string, string>;
	timeoutMs?: number;
	enabled?: boolean;
}

/** A remote MCP server reached over HTTP (Streamable HTTP or legacy SSE). */
export interface McpHttpServerConfig {
	type: "http" | "sse";
	name: string;
	url: string;
	/** Extra static HTTP headers sent on every request. */
	headers?: Record<string, string>;
	/** Use the browser OAuth 2.1 + PKCE + dynamic client registration flow (`/mcp login <name>`). */
	oauth?: boolean;
	/** Name of an env var holding a static bearer token, as an alternative to OAuth. */
	bearerTokenEnvVar?: string;
	timeoutMs?: number;
	enabled?: boolean;
}

export type McpServerConfig = McpStdioServerConfig | McpHttpServerConfig;

/** Settings-file shape for a user-declared server: same fields, minus `name` (the settings key doubles as the name). */
export type McpUserServerConfig = Omit<McpStdioServerConfig, "name"> | Omit<McpHttpServerConfig, "name">;

export type McpServerStatus = { status: "connected" } | { status: "disabled" } | { status: "failed"; error: string };

export interface McpToolDef {
	name: string;
	description?: string;
	inputSchema: Record<string, unknown>;
}
