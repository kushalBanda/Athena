import { Type } from "@sinclair/typebox";
import { BaseTool, err, ok } from "../base.js";
import type { ToolContext } from "../types.js";

const EXA_MCP_URL = "https://mcp.exa.ai/mcp";
const MAX_RESPONSE_BYTES = 256 * 1024;

const Schema = Type.Object({
  query: Type.String({ description: "Search query" }),
  numResults: Type.Optional(Type.Number({ minimum: 1, maximum: 10, default: 5 })),
});

interface ExaResult {
  title?: string;
  url?: string;
  snippet?: string;
}

export class WebSearchTool extends BaseTool<typeof Schema> {
  readonly name = "web_search";
  readonly description =
    "Search the web via Exa. Returns titles, URLs, and snippets for matching pages. Use for current information beyond knowledge cutoff.";
  readonly permission = "auto" as const;
  readonly schema = Schema;

  private exaApiKey: string | undefined;

  constructor(exaApiKey?: string) {
    super();
    this.exaApiKey = exaApiKey;
  }

  protected async run(input: { query: string; numResults?: number }, _ctx: ToolContext) {
    const url = this.exaApiKey
      ? `${EXA_MCP_URL}?exaApiKey=${encodeURIComponent(this.exaApiKey)}`
      : EXA_MCP_URL;

    const body = {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: {
        name: "web_search_exa",
        arguments: {
          query: input.query,
          numResults: input.numResults ?? 5,
        },
      },
    };

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15_000),
      });

      if (!res.ok) return err(`Exa returned ${res.status}: ${await res.text()}`);

      const raw = await res.arrayBuffer();
      if (raw.byteLength > MAX_RESPONSE_BYTES) {
        return err("Response too large from Exa");
      }

      const raw2 = new TextDecoder().decode(raw);
      const dataLine = raw2.split("\n").find((l) => l.startsWith("data:"));
      const jsonStr = dataLine ? dataLine.slice(5).trim() : raw2;
      const json = JSON.parse(jsonStr) as {
        result?: { content?: Array<{ text?: string }> };
      };

      const text = json.result?.content?.[0]?.text;
      if (!text) return ok("No search results found. Try a different query.");

      const results: ExaResult[] = safeParseExaText(text);
      const formatted = results
        .slice(0, input.numResults ?? 5)
        .map((r, i) => `${i + 1}. ${r.title ?? "Untitled"}\n   ${r.url ?? ""}\n   ${r.snippet ?? ""}`)
        .join("\n\n");

      return ok(formatted || text);
    } catch (e) {
      return err(`Web search failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
}

function safeParseExaText(text: string): ExaResult[] {
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) return parsed as ExaResult[];
  } catch {
    // not JSON — Exa returned pre-formatted text
  }
  return [{ snippet: text }];
}
