import { Type } from "@sinclair/typebox";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";
import { BaseTool, err, ok } from "../base.js";
import type { ToolContext } from "../types.js";

type CodegraphModule = {
  ContextBuilder: new (dbPath: string) => {
    buildContext(
      query: string,
      options?: {
        format?: "markdown" | "json";
        maxNodes?: number;
        maxCodeBlocks?: number;
        traversalDepth?: number;
      },
    ): Promise<string>;
  };
};

const Schema = Type.Object({
  query: Type.String({
    description: "Natural-language question or symbol/file names to look up in the code graph.",
  }),
  maxNodes: Type.Optional(Type.Number({ minimum: 1, default: 20 })),
  traversalDepth: Type.Optional(Type.Number({ minimum: 0, default: 1 })),
});

export class CodegraphQueryTool extends BaseTool<typeof Schema> {
  readonly name = "codegraph_query";
  readonly description =
    "Query the repository's CodeGraph index (if present) for symbols, source, and call relationships relevant to a question. Only available when a `.codegraph/index.db` exists.";
  readonly permission = "auto" as const;
  readonly schema = Schema;

  protected async run(
    input: { query: string; maxNodes?: number; traversalDepth?: number },
    ctx: ToolContext,
  ) {
    const dbPath = join(ctx.workingDir, ".codegraph", "index.db");
    if (!existsSync(dbPath)) {
      return err("No CodeGraph index found at .codegraph/index.db in this project.");
    }

    try {
      const require = createRequire(import.meta.url);
      const pkg = require("@codegraph/core") as CodegraphModule;
      const builder = new pkg.ContextBuilder(dbPath);
      const context = await builder.buildContext(input.query, {
        format: "markdown",
        maxNodes: input.maxNodes ?? 20,
        maxCodeBlocks: 5,
        traversalDepth: input.traversalDepth ?? 1,
      });
      return ok(context || "No matching symbols found.");
    } catch (e) {
      return err(`CodeGraph query failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
}
