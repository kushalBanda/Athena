import { Type } from "@sinclair/typebox";
import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { BaseTool, err, ok } from "../base.js";
import type { ToolContext } from "../types.js";

const Schema = Type.Object({
  path: Type.String({ description: "Path to write to (created if not exists)" }),
  content: Type.String({ description: "Content to write" }),
});

export class WriteFileTool extends BaseTool<typeof Schema> {
  readonly name = "write_file";
  readonly description = "Write content to a file. Creates parent directories if needed. Overwrites existing files.";
  readonly permission = "auto" as const;
  readonly schema = Schema;

  protected async run(input: { path: string; content: string }, ctx: ToolContext) {
    const resolved = path.resolve(ctx.workingDir, input.path);

    try {
      await mkdir(path.dirname(resolved), { recursive: true });
      await writeFile(resolved, input.content, "utf-8");
      return ok(`Wrote ${input.content.length} bytes to ${resolved}`);
    } catch (e) {
      return err(`Write failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
}
