import { Type } from "@sinclair/typebox";
import path from "node:path";
import { BaseTool, err, ok } from "../base.js";
import type { ToolContext } from "../types.js";
import { spawnCollect } from "../spawn.js";

const Schema = Type.Object({
  pattern: Type.String({ description: "Filename pattern, e.g. '*.ts' or 'package.json'" }),
  path: Type.Optional(
    Type.String({ description: "Directory to search (defaults to working dir)" }),
  ),
  type: Type.Optional(
    Type.Union([Type.Literal("f"), Type.Literal("d")], {
      description: "'f' for files, 'd' for directories",
    }),
  ),
  maxResults: Type.Optional(Type.Number({ minimum: 1, default: 200 })),
});

export class FindTool extends BaseTool<typeof Schema> {
  readonly name = "find";
  readonly description = "Find files or directories matching a name pattern.";
  readonly permission = "auto" as const;
  readonly schema = Schema;

  protected async run(
    input: { pattern: string; path?: string; type?: "f" | "d"; maxResults?: number },
    ctx: ToolContext,
  ) {
    const searchPath = path.resolve(ctx.workingDir, input.path ?? ".");
    const maxResults = input.maxResults ?? 200;

    const withPrune = [
      searchPath,
      "(",
      "-name",
      "node_modules",
      "-o",
      "-name",
      ".git",
      "-o",
      "-name",
      "dist",
      ")",
      "-prune",
      "-o",
      "-name",
      input.pattern,
      ...(input.type ? ["-type", input.type] : []),
      "-print",
    ];

    const { stdout, stderr, code } = await spawnCollect("find", withPrune);

    if (code !== 0) return err(stderr || `find exited with code ${code}`);

    const lines = stdout.split("\n").filter(Boolean);
    const truncated = lines.slice(0, maxResults);
    const suffix =
      lines.length > maxResults ? `\n[${lines.length - maxResults} more results omitted]` : "";
    return ok(truncated.join("\n") + suffix || "No matches found.");
  }
}
