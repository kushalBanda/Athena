import { once } from "node:events";
import { createServer, type IncomingMessage, type RequestListener, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createWebSearchTool } from "../src/core/tools/websearch.ts";

const servers: Server[] = [];

async function listen(handler: RequestListener): Promise<{ server: Server; url: string }> {
	const server = createServer(handler);
	servers.push(server);
	server.listen(0, "127.0.0.1");
	await once(server, "listening");
	const address = server.address() as AddressInfo;
	return { server, url: `http://127.0.0.1:${address.port}` };
}

function readBody(req: IncomingMessage): Promise<string> {
	return new Promise((resolve) => {
		const chunks: Buffer[] = [];
		req.on("data", (chunk: Buffer) => chunks.push(chunk));
		req.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
	});
}

function mcpResult(text: string): string {
	return JSON.stringify({ result: { content: [{ type: "text", text }] } });
}

afterEach(async () => {
	await Promise.all(
		servers.splice(0).map(
			(server) =>
				new Promise<void>((resolve) => {
					server.close(() => resolve());
					server.closeAllConnections();
				}),
		),
	);
});

describe("websearch tool", () => {
	it("returns the search result text from a single JSON response", async () => {
		const { url } = await listen((_req, res) => {
			res.writeHead(200, { "Content-Type": "application/json" });
			res.end(mcpResult("Athena is a coding agent."));
		});
		const tool = createWebSearchTool(process.cwd(), { baseUrl: url });
		const result = await tool.execute("call-1", { query: "what is athena" }, undefined, undefined);
		expect(result.content).toEqual([{ type: "text", text: "Athena is a coding agent." }]);
	});

	it("parses an SSE-framed response", async () => {
		const { url } = await listen((_req, res) => {
			res.writeHead(200, { "Content-Type": "text/event-stream" });
			res.end(`event: message\ndata: ${mcpResult("SSE result")}\n\n`);
		});
		const tool = createWebSearchTool(process.cwd(), { baseUrl: url });
		const result = await tool.execute("call-1", { query: "q" }, undefined, undefined);
		expect(result.content).toEqual([{ type: "text", text: "SSE result" }]);
	});

	it("returns the no-results sentinel when the payload has no text", async () => {
		const { url } = await listen((_req, res) => {
			res.writeHead(200, { "Content-Type": "application/json" });
			res.end(JSON.stringify({ result: { content: [] } }));
		});
		const tool = createWebSearchTool(process.cwd(), { baseUrl: url });
		const result = await tool.execute("call-1", { query: "q" }, undefined, undefined);
		expect(result.content).toEqual([
			{ type: "text", text: "No search results found. Please try a different query." },
		]);
	});

	it("throws on a non-2xx response", async () => {
		const { url } = await listen((_req, res) => {
			res.writeHead(500, { "Content-Type": "text/plain" });
			res.end("boom");
		});
		const tool = createWebSearchTool(process.cwd(), { baseUrl: url });
		await expect(tool.execute("call-1", { query: "q" }, undefined, undefined)).rejects.toThrow(/Web search failed/);
	});

	it("throws with a 'timed out' message when the server never responds within the timeout", async () => {
		const { url } = await listen(() => {
			// Never call res.end() — simulate a hung server.
		});
		const tool = createWebSearchTool(process.cwd(), { baseUrl: url, timeoutMs: 50 });
		await expect(tool.execute("call-1", { query: "q" }, undefined, undefined)).rejects.toThrow(/timed out/);
	});

	it("rethrows a caller-initiated abort without wrapping it as a search failure", async () => {
		const { url } = await listen(() => {
			// Never call res.end() — the abort must win the race, not the server.
		});
		const controller = new AbortController();
		const tool = createWebSearchTool(process.cwd(), { baseUrl: url });
		const pending = tool.execute("call-1", { query: "q" }, controller.signal, undefined);
		controller.abort();
		let caught: unknown;
		try {
			await pending;
		} catch (error) {
			caught = error;
		}
		expect(caught).toBeInstanceOf(Error);
		expect((caught as Error).message).not.toMatch(/Web search failed/);
	});

	it("throws when the response body is valid JSON but doesn't match the expected shape", async () => {
		const { url } = await listen((_req, res) => {
			res.writeHead(200, { "Content-Type": "application/json" });
			res.end(JSON.stringify({ unexpected: "shape" }));
		});
		const tool = createWebSearchTool(process.cwd(), { baseUrl: url });
		await expect(tool.execute("call-1", { query: "q" }, undefined, undefined)).rejects.toThrow(
			/unexpected response format/,
		);
	});

	it("clamps numResults above the maximum to 20", async () => {
		let body = "";
		const { url } = await listen(async (req, res) => {
			body = await readBody(req);
			res.writeHead(200, { "Content-Type": "application/json" });
			res.end(mcpResult("ok"));
		});
		const tool = createWebSearchTool(process.cwd(), { baseUrl: url });
		await tool.execute("call-1", { query: "q", numResults: 500 }, undefined, undefined);
		expect(JSON.parse(body).params.arguments.numResults).toBe(20);
	});

	it("sends the default numResults (8) when the model omits it", async () => {
		let body = "";
		const { url } = await listen(async (req, res) => {
			body = await readBody(req);
			res.writeHead(200, { "Content-Type": "application/json" });
			res.end(mcpResult("ok"));
		});
		const tool = createWebSearchTool(process.cwd(), { baseUrl: url });
		await tool.execute("call-1", { query: "q" }, undefined, undefined);
		expect(JSON.parse(body).params.arguments.numResults).toBe(8);
	});

	it("throws when the response body exceeds the size cap", async () => {
		const { url } = await listen((_req, res) => {
			res.writeHead(200, { "Content-Type": "application/json" });
			res.end(mcpResult("x".repeat(300_000)));
		});
		const tool = createWebSearchTool(process.cwd(), { baseUrl: url });
		await expect(tool.execute("call-1", { query: "q" }, undefined, undefined)).rejects.toThrow(/Web search failed/);
	});

	it("appends the API key to the request URL as a query param when provided", async () => {
		let receivedUrl = "";
		const { url } = await listen((req, res) => {
			receivedUrl = req.url ?? "";
			res.writeHead(200, { "Content-Type": "application/json" });
			res.end(mcpResult("ok"));
		});
		const tool = createWebSearchTool(process.cwd(), { baseUrl: url, apiKey: "secret-key" });
		await tool.execute("call-1", { query: "q" }, undefined, undefined);
		expect(receivedUrl).toContain("exaApiKey=secret-key");
	});

	it("omits the API key query param when none is configured", async () => {
		vi.stubEnv("EXA_API_KEY", undefined);
		let receivedUrl = "";
		const { url } = await listen((req, res) => {
			receivedUrl = req.url ?? "";
			res.writeHead(200, { "Content-Type": "application/json" });
			res.end(mcpResult("ok"));
		});
		const tool = createWebSearchTool(process.cwd(), { baseUrl: url });
		await tool.execute("call-1", { query: "q" }, undefined, undefined);
		expect(receivedUrl).not.toContain("exaApiKey");
	});

	it("sends the query, numResults and livecrawl as JSON-RPC tool arguments", async () => {
		let body = "";
		const { url } = await listen(async (req, res) => {
			body = await readBody(req);
			res.writeHead(200, { "Content-Type": "application/json" });
			res.end(mcpResult("ok"));
		});
		const tool = createWebSearchTool(process.cwd(), { baseUrl: url });
		await tool.execute(
			"call-1",
			{ query: "typescript generics", numResults: 3, livecrawl: "preferred" },
			undefined,
			undefined,
		);
		const parsed = JSON.parse(body);
		expect(parsed.method).toBe("tools/call");
		expect(parsed.params.name).toBe("web_search_exa");
		expect(parsed.params.arguments).toEqual({
			query: "typescript generics",
			numResults: 3,
			livecrawl: "preferred",
		});
	});

	it("never includes the raw API key in a thrown error message", async () => {
		const { url } = await listen((_req, res) => {
			res.writeHead(500, { "Content-Type": "text/plain" });
			res.end("boom");
		});
		const tool = createWebSearchTool(process.cwd(), { baseUrl: url, apiKey: "super-secret" });
		await expect(tool.execute("call-1", { query: "q" }, undefined, undefined)).rejects.not.toThrow(/super-secret/);
	});
});
