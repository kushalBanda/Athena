import type { ImageContent, TextContent } from "@kushalbanda/ai";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { CallToolResultSchema } from "@modelcontextprotocol/sdk/types.js";
import type { TSchema } from "typebox";
import type { ToolDefinition } from "../extensions/types.ts";
import type { McpToolDef } from "./types.ts";

/**
 * `serverName_toolName`, non-alphanumerics collapsed to `_`, so multiple
 * servers can't collide. Skips the prefix when the tool's own name already
 * starts with it (e.g. CodeGraph's `codegraph_explore` from a `codegraph`
 * server) to avoid a redundant `codegraph_codegraph_explore`.
 */
export function mcpToolName(serverName: string, toolName: string): string {
	const sanitize = (value: string) => value.replace(/[^a-zA-Z0-9_-]/g, "_");
	const sanitizedServer = sanitize(serverName);
	const sanitizedTool = sanitize(toolName);
	if (sanitizedTool === sanitizedServer || sanitizedTool.startsWith(`${sanitizedServer}_`)) {
		return sanitizedTool;
	}
	return `${sanitizedServer}_${sanitizedTool}`;
}

/** MCP text/image content items are structurally identical to Athena's own —
 * other MCP content kinds (resource, audio, ...) have no Athena equivalent
 * yet, so they're dropped rather than mis-mapped. */
function toAthenaContent(items: Array<{ type: string; text?: string; data?: string; mimeType?: string }>): Array<
	TextContent | ImageContent
> {
	const content: Array<TextContent | ImageContent> = [];
	for (const item of items) {
		if (item.type === "text" && typeof item.text === "string") {
			content.push({ type: "text", text: item.text });
		} else if (item.type === "image" && typeof item.data === "string" && typeof item.mimeType === "string") {
			content.push({ type: "image", data: item.data, mimeType: item.mimeType });
		}
	}
	return content;
}

/**
 * Wraps a discovered MCP tool into an Athena `ToolDefinition`. `execute`
 * calls `client.callTool()`; an `isError` result is thrown as an Error
 * (matching how Athena's other tools surface failures), and a
 * `structuredContent`-only result is stringified into text content so
 * downstream consumers always see at least one text block.
 */
export function convertMcpTool(
	serverName: string,
	def: McpToolDef,
	client: Client,
	timeoutMs?: number,
): ToolDefinition<TSchema> {
	const name = mcpToolName(serverName, def.name);
	return {
		name,
		label: serverName,
		description: def.description ?? "",
		parameters: def.inputSchema as unknown as TSchema,
		async execute(_toolCallId, args: unknown, signal?: AbortSignal) {
			if (signal?.aborted) throw new Error("Operation aborted");

			const result = await client.callTool(
				{ name: def.name, arguments: (args ?? {}) as Record<string, unknown> },
				CallToolResultSchema,
				{ timeout: timeoutMs, signal, resetTimeoutOnProgress: true, onprogress: () => {} },
			);

			const rawContent = result.content as Array<{ type: string; text?: string; data?: string; mimeType?: string }>;

			if (result.isError) {
				const message = rawContent
					.flatMap((item) => (item.type === "text" && item.text ? [item.text] : []))
					.filter((text) => text.trim())
					.join("\n\n");
				throw new Error(message || `MCP tool ${def.name} returned an error`);
			}

			const content = toAthenaContent(rawContent);
			if (content.length > 0) {
				return { content, details: undefined };
			}
			if (result.structuredContent !== undefined && result.structuredContent !== null) {
				return {
					content: [{ type: "text" as const, text: JSON.stringify(result.structuredContent) }],
					details: undefined,
				};
			}
			return { content: [{ type: "text" as const, text: "" }], details: undefined };
		},
	};
}
