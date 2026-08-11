import { existsSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { formatFromExtension, toMarkdown } from "@firecrawl/anydoc";
import { Type } from "@sinclair/typebox";
import { BaseTool, err, ok } from "../base.js";
import { isConvertError } from "../lib/anydoc-convert.js";
import type { ToolContext } from "../types.js";

const Schema = Type.Object({
  path: Type.String({ description: "Absolute or relative path to file" }),
  maxBytes: Type.Optional(Type.Number({ minimum: 1, default: 200_000 })),
});

export class ReadFileTool extends BaseTool<typeof Schema> {
  readonly name = "read_file";
  readonly description = "Read the contents of a file at the given path. Returns raw text.";
  readonly permission = "auto" as const;
  readonly schema = Schema;

  protected async run(input: { path: string; maxBytes?: number }, ctx: ToolContext) {
    const resolved = path.resolve(ctx.workingDir, input.path);

    if (!existsSync(resolved)) {
      return err(`File not found: ${resolved}`);
    }

    if (formatFromExtension(path.extname(resolved)) !== null) {
      try {
        return ok(await toMarkdown(resolved));
      } catch (e) {
        if (!isConvertError(e)) throw e;
      }
    }

    const maxBytes = input.maxBytes ?? 200_000;
    const { size } = await stat(resolved);

    if (size > maxBytes) {
      const buffer = await readFile(resolved);
      const text = new TextDecoder().decode(buffer.subarray(0, maxBytes));
      return ok(`${text}\n\n[truncated — ${size} bytes total, showed first ${maxBytes}]`);
    }

    return ok(await readFile(resolved, "utf-8"));
  }
}
