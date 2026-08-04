import { Type } from "@sinclair/typebox";
import path from "node:path";
import { BaseTool, err, ok } from "../base.js";
import type { ToolContext } from "../types.js";
import { spawnCollect } from "../spawn.js";

const Schema = Type.Object({
  pattern: Type.String({ description: "Regex or string pattern to search for" }),
  path: Type.Optional(Type.String({ description: "Directory or file to search (defaults to working dir)" })),
  glob: Type.Optional(Type.String({ description: "File glob filter, e.g. '*.ts'" })),
  ignoreCase: Type.Optional(Type.Boolean({ default: false })),
  maxResults: Type.Optional(Type.Number({ minimum: 1, default: 100 })),
});

export class GrepTool extends BaseTool<typeof Schema> {
  readonly name = "grep";
  readonly description =
    "Search for a pattern in files using grep. Returns matching lines with file:line context.";
  readonly permission = "auto" as const;
  readonly schema = Schema;

  protected async run(
    input: { pattern: string; path?: string; glob?: string; ignoreCase?: boolean; maxResults?: number },
    ctx: ToolContext,
  ) {
    const searchPath = path.resolve(ctx.workingDir, input.path ?? ".");
    const maxResults = input.maxResults ?? 100;

    const args = ["-rn", "--include", input.glob ?? "*"];

    if (input.ignoreCase) args.push("-i");
    args.push(input.pattern, searchPath);

    const { stdout, stderr, code } = await spawnCollect("grep", args);

    if (code !== 0 && !stdout) {
      if (code === 1) return ok("No matches found.");
      return err(stderr || `grep exited with code ${code}`);
    }

    const lines = stdout.split("\n").filter(Boolean);
    const truncated = lines.slice(0, maxResults);
    const suffix = lines.length > maxResults ? `\n[${lines.length - maxResults} more results omitted]` : "";
    return ok(truncated.join("\n") + suffix);
  }
}
