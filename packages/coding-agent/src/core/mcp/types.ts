export interface McpServerConfig {
	name: string;
	command: string[];
	cwd?: string;
	env?: Record<string, string>;
	timeoutMs?: number;
	enabled?: boolean;
}

export type McpServerStatus =
	| { status: "connected" }
	| { status: "disabled" }
	| { status: "failed"; error: string };

export interface McpToolDef {
	name: string;
	description?: string;
	inputSchema: Record<string, unknown>;
}
