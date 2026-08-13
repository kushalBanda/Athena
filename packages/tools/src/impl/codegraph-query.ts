import { existsSync } from "node:fs";
import { Type } from "@sinclair/typebox";
import { BaseTool, err, ok } from "../base.js";
import { resolveCodegraphCore } from "../codegraph/core-module.js";
import { getIndexDbPath } from "../codegraph/paths.js";
import type { ToolContext } from "../types.js";

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
    "Query the repository's CodeGraph index (if present) for symbols, source, and call relationships relevant to a question. Only available when a `.codegraph/codegraph.db` exists.";
  readonly permission = "auto" as const;
  readonly schema = Schema;

  protected async run(
    input: { query: string; maxNodes?: number; traversalDepth?: number },
    ctx: ToolContext,
  ) {
    if (!existsSync(getIndexDbPath(ctx.workingDir))) {
      return err("No CodeGraph index found at .codegraph/codegraph.db in this project.");
    }

    const core = resolveCodegraphCore();
    if (core === null) {
      return err("@colbymchenry/codegraph is not installed.");
    }

    let graph: Awaited<ReturnType<typeof core.CodeGraph.open>> | null = null;
    try {
      // open() takes the project root, not the db file — it resolves .codegraph/codegraph.db itself.
      graph = await core.CodeGraph.open(ctx.workingDir);
      const context = await graph.buildContext(input.query, {
        format: "markdown",
        maxNodes: input.maxNodes ?? 20,
        maxCodeBlocks: 5,
        traversalDepth: input.traversalDepth ?? 1,
      });
      return ok(context || "No matching symbols found.");
    } catch (e) {
      return err(`CodeGraph query failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      if (graph !== null) graph.close();
    }
  }
}
