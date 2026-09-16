import type { AgentTool } from "@kushalbanda/agent-core";
import { type Static, Type } from "typebox";
import type { ToolDefinition } from "../extensions/types.ts";
import { wrapToolDefinition } from "./tool-definition-wrapper.ts";

export const EXA_URL = "https://mcp.exa.ai/mcp";
export const NO_RESULTS = "No search results found. Please try a different query.";
export const MAX_RESPONSE_BYTES = 256 * 1024;
const DEFAULT_TIMEOUT_MS = 25_000;
const DEFAULT_NUM_RESULTS = 8;
const MAX_NUM_RESULTS = 20;

const webSearchSchema = Type.Object({
	query: Type.String({ description: "Web search query" }),
	numResults: Type.Optional(
		Type.Number({
			description: `Number of results to return (default: ${DEFAULT_NUM_RESULTS}, max: ${MAX_NUM_RESULTS})`,
		}),
	),
	livecrawl: Type.Optional(
		Type.Union([Type.Literal("fallback"), Type.Literal("preferred")], {
			description:
				"'fallback': use live crawling only if cached content is unavailable (default). 'preferred': prioritize live crawling.",
		}),
	),
});

export type WebSearchToolInput = Static<typeof webSearchSchema>;

export interface WebSearchToolDetails {
	provider: "exa";
}

export interface WebSearchToolOptions {
	apiKey?: string;
	baseUrl?: string;
	defaultNumResults?: number;
	timeoutMs?: number;
}

export const webSearchToolSystemPromptContribution = {
	snippet: "Search the web for current information beyond your knowledge cutoff",
	guidelines: [
		"Use websearch for current events, recent releases, or facts that may have changed since training.",
		"Prefer read/grep/find over websearch for information already available in the codebase.",
	],
} as const;

function searchUrl(baseUrl: string, apiKey: string | undefined): string {
	if (!apiKey) return baseUrl;
	const url = new URL(baseUrl);
	url.searchParams.set("exaApiKey", apiKey);
	return url.toString();
}

function stripApiKey(url: string): string {
	try {
		const parsed = new URL(url);
		parsed.searchParams.delete("exaApiKey");
		return parsed.toString();
	} catch {
		return url;
	}
}

type ExtractedResult = { kind: "found"; text: string } | { kind: "empty" } | { kind: "malformed" };

function extractResultText(payload: unknown): ExtractedResult {
	if (typeof payload !== "object" || payload === null) return { kind: "malformed" };
	const result = (payload as { result?: unknown }).result;
	if (typeof result !== "object" || result === null) return { kind: "malformed" };
	const content = (result as { content?: unknown }).content;
	if (!Array.isArray(content)) return { kind: "malformed" };
	for (const item of content) {
		if (item && typeof item === "object" && typeof (item as { text?: unknown }).text === "string") {
			const text = (item as { text: string }).text;
			if (text) return { kind: "found", text };
		}
	}
	return { kind: "empty" };
}

function parseResponseBody(body: string): ExtractedResult {
	const trimmed = body.trim();
	if (trimmed.startsWith("{")) {
		try {
			return extractResultText(JSON.parse(trimmed));
		} catch {
			return { kind: "malformed" };
		}
	}
	let sawRecognizedShape = false;
	for (const line of body.split("\n")) {
		if (!line.startsWith("data: ")) continue;
		try {
			const parsed = extractResultText(JSON.parse(line.slice("data: ".length)));
			if (parsed.kind === "found") return parsed;
			if (parsed.kind === "empty") sawRecognizedShape = true;
		} catch {
			// Try the next data line.
		}
	}
	return sawRecognizedShape ? { kind: "empty" } : { kind: "malformed" };
}

function clampNumResults(value: number | undefined, fallback: number): number {
	const requested = Math.trunc(value ?? fallback);
	return Math.min(Math.max(requested, 1), MAX_NUM_RESULTS);
}

async function runSearch(
	input: WebSearchToolInput,
	options: WebSearchToolOptions,
	signal: AbortSignal | undefined,
): Promise<string> {
	const apiKey = options.apiKey ?? process.env.EXA_API_KEY;
	const target = searchUrl(options.baseUrl ?? EXA_URL, apiKey);
	const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
	const timeout = AbortSignal.timeout(timeoutMs);
	const requestSignal = signal ? AbortSignal.any([signal, timeout]) : timeout;

	let response: Response;
	try {
		response = await fetch(target, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Accept: "application/json, text/event-stream",
			},
			body: JSON.stringify({
				jsonrpc: "2.0",
				id: 1,
				method: "tools/call",
				params: {
					name: "web_search_exa",
					arguments: {
						query: input.query,
						numResults: clampNumResults(input.numResults, options.defaultNumResults ?? DEFAULT_NUM_RESULTS),
						livecrawl: input.livecrawl ?? "fallback",
					},
				},
			}),
			signal: requestSignal,
		});
	} catch (error) {
		if (signal?.aborted) throw error;
		if (timeout.aborted) {
			throw new Error(`Web search failed for "${input.query}": timed out after ${timeoutMs}ms`);
		}
		throw new Error(`Web search failed for "${input.query}": ${(error as Error).message}`);
	}

	if (!response.ok) {
		throw new Error(
			`Web search failed for "${input.query}": ${stripApiKey(target)} returned HTTP ${response.status}`,
		);
	}

	const body = await response.text();
	if (Buffer.byteLength(body, "utf-8") > MAX_RESPONSE_BYTES) {
		throw new Error(`Web search failed for "${input.query}": response exceeded ${MAX_RESPONSE_BYTES} bytes`);
	}

	const parsed = parseResponseBody(body);
	if (parsed.kind === "malformed") {
		throw new Error(`Web search failed for "${input.query}": unexpected response format`);
	}
	return parsed.kind === "found" ? parsed.text : NO_RESULTS;
}

export function createWebSearchToolDefinition(
	_cwd: string,
	options: WebSearchToolOptions = {},
): ToolDefinition<typeof webSearchSchema, WebSearchToolDetails | undefined> {
	return {
		name: "websearch",
		label: "websearch",
		description:
			"Search the web via Exa. Returns titles, URLs, and content snippets for the query. Use for current information beyond your knowledge cutoff.",
		promptSnippet: webSearchToolSystemPromptContribution.snippet,
		promptGuidelines: [...webSearchToolSystemPromptContribution.guidelines],
		parameters: webSearchSchema,
		async execute(_toolCallId, params, signal) {
			const text = await runSearch(params, options, signal);
			return {
				content: [{ type: "text", text }],
				details: { provider: "exa" },
			};
		},
	};
}

export function createWebSearchTool(cwd: string, options?: WebSearchToolOptions): AgentTool<typeof webSearchSchema> {
	return wrapToolDefinition(createWebSearchToolDefinition(cwd, options));
}
