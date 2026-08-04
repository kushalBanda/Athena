import { Type } from "@sinclair/typebox";
import { Parser } from "htmlparser2";
import TurndownService from "turndown";
import { BaseTool, err, ok } from "../base.js";
import type { ToolContext } from "../types.js";

const MAX_RESPONSE_BYTES = 5 * 1024 * 1024;
const MAX_OUTPUT_CHARS = 50_000;

const Schema = Type.Object({
  url: Type.String({ description: "HTTP or HTTPS URL to fetch" }),
  format: Type.Optional(
    Type.Union([Type.Literal("markdown"), Type.Literal("text"), Type.Literal("html")], {
      description: "Output format. Defaults to markdown.",
      default: "markdown",
    }),
  ),
});

const turndown = new TurndownService({ headingStyle: "atx", codeBlockStyle: "fenced" });

export class WebFetchTool extends BaseTool<typeof Schema> {
  readonly name = "web_fetch";
  readonly description =
    "Fetch content from a URL and return it as markdown (default), plain text, or raw HTML.";
  readonly permission = "auto" as const;
  readonly schema = Schema;

  protected async run(input: { url: string; format?: "markdown" | "text" | "html" }, _ctx: ToolContext) {
    const format = input.format ?? "markdown";

    try {
      const res = await fetch(input.url, {
        headers: { "User-Agent": "athena-agent/0.1" },
        signal: AbortSignal.timeout(30_000),
      });

      if (!res.ok) return err(`HTTP ${res.status}: ${res.statusText}`);

      const contentType = res.headers.get("content-type") ?? "";
      const raw = await res.arrayBuffer();

      if (raw.byteLength > MAX_RESPONSE_BYTES) {
        return err(`Response too large (${raw.byteLength} bytes)`);
      }

      const html = new TextDecoder().decode(raw);

      if (format === "html") return ok(truncate(html));
      if (format === "text") return ok(truncate(extractText(html)));

      const md = contentType.includes("text/html") ? turndown.turndown(html) : html;
      return ok(truncate(md));
    } catch (e) {
      return err(`Fetch failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
}

function extractText(html: string): string {
  const chunks: string[] = [];
  let inScript = false;
  let inStyle = false;

  const parser = new Parser({
    onopentag(name) {
      if (name === "script") inScript = true;
      if (name === "style") inStyle = true;
    },
    onclosetag(name) {
      if (name === "script") inScript = false;
      if (name === "style") inStyle = false;
    },
    ontext(text) {
      if (!inScript && !inStyle) chunks.push(text);
    },
  });

  parser.write(html);
  parser.end();
  return chunks.join(" ").replace(/\s+/g, " ").trim();
}

function truncate(text: string): string {
  if (text.length <= MAX_OUTPUT_CHARS) return text;
  return `${text.slice(0, MAX_OUTPUT_CHARS)}\n\n[truncated — ${text.length} chars total]`;
}
