import { Type } from "@sinclair/typebox";
import { BaseTool, ok } from "../base.js";
import { MAX_FEDERATED_REPOS, federatedQuery } from "../codegraph/federated-query.js";
import type { ToolContext } from "../types.js";

const Schema = Type.Object({
  query: Type.String({
    description: "Natural-language question or symbol/file name to search for across repos.",
  }),
  repoPaths: Type.Array(Type.String(), {
    minItems: 1,
    maxItems: MAX_FEDERATED_REPOS,
    description: `Absolute paths to sibling repos to search (max ${MAX_FEDERATED_REPOS}). Each is expected to have its own .codegraph/codegraph.db; repos without one are silently skipped.`,
  }),
});

export class CodegraphFederatedQueryTool extends BaseTool<typeof Schema> {
  readonly name = "codegraph_federated_query";
  readonly description =
    "Search across multiple locally checked-out repos' CodeGraph indexes in a single call. " +
    "Always callable — repos without a .codegraph/codegraph.db are silently skipped rather than " +
    "erroring, so an empty/partial result set is expected, not a failure. " +
    "Use codegraph_query instead for a single repo.";
  readonly permission = "auto" as const;
  readonly schema = Schema;

  protected async run(input: { query: string; repoPaths: string[] }, _ctx: ToolContext) {
    const matches = await federatedQuery(input.query, input.repoPaths);
    if (matches.length === 0) {
      return ok(
        "No matches found across the given repos (or none of them have a .codegraph index).",
      );
    }
    const lines = matches.map(
      (m) =>
        `[${m.repoPath}] ${m.node.kind} ${m.node.name} — ${m.node.filePath}:${m.node.startLine}`,
    );
    return ok(lines.join("\n"));
  }
}
