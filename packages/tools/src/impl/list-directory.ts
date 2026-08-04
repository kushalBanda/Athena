import { Type } from "@sinclair/typebox";
import path from "node:path";
import { readdir, stat } from "node:fs/promises";
import { BaseTool, err, ok } from "../base.js";
import type { ToolContext } from "../types.js";

const Schema = Type.Object({
  path: Type.Optional(Type.String({ description: "Directory to list (defaults to working dir)" })),
});

export class ListDirectoryTool extends BaseTool<typeof Schema> {
  readonly name = "list_directory";
  readonly description = "List files and directories at a path with type and size metadata.";
  readonly permission = "auto" as const;
  readonly schema = Schema;

  protected async run(input: { path?: string }, ctx: ToolContext) {
    const resolved = path.resolve(ctx.workingDir, input.path ?? ".");

    try {
      const entries = await readdir(resolved, { withFileTypes: true });
      const lines = await Promise.all(
        entries.map(async (e) => {
          const full = path.join(resolved, e.name);
          const s = await stat(full).catch(() => null);
          const size = s && e.isFile() ? ` (${s.size}B)` : "";
          const suffix = e.isDirectory() ? "/" : "";
          return `${e.name}${suffix}${size}`;
        }),
      );
      return ok(lines.join("\n"));
    } catch (e) {
      return err(`List failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
}
