import { existsSync } from "node:fs";
import { resolveCodegraphCore } from "./core-module.js";
import { getIndexDbPath } from "./paths.js";
import { withTimeout } from "./timeout.js";
import type { BlastRadius, CodeGraphHandle } from "./types.js";

const QUERY_TIMEOUT_MS = 500;

// Best-effort symbol extraction, scoped to the edited region only (not the whole file).
function inferSymbolName(editedRegionText: string): string | null {
  const match = editedRegionText.match(
    /(?:export\s+)?(?:function|class|const|let)\s+([A-Za-z_$][A-Za-z0-9_$]*)/,
  );
  return match?.[1] ?? null;
}

export async function getBlastRadius(
  cwd: string,
  _filePath: string,
  editedRegionText: string,
): Promise<BlastRadius | null> {
  if (!existsSync(getIndexDbPath(cwd))) return null;

  const core = resolveCodegraphCore();
  if (core === null) return null;

  const symbolName = inferSymbolName(editedRegionText);
  if (symbolName === null) return null;

  // Tracked outside the raced promise so a timed-out query still closes its handle.
  let graph: CodeGraphHandle | null = null;

  const work = (async () => {
    // open() takes the project root, not the db file — it resolves .codegraph/codegraph.db itself.
    graph = await core.CodeGraph.open(cwd);
    const matches = graph.searchNodes(symbolName);
    const firstMatch = matches[0];
    if (firstMatch === undefined) return null;
    const callers = graph.getCallers(firstMatch.node.id, 1);
    return {
      symbol: symbolName,
      callers: callers.map((c) => ({
        file: c.node.filePath,
        line: c.node.startLine,
        name: c.node.name,
      })),
    } satisfies BlastRadius;
  })().catch(() => null);

  try {
    return await withTimeout(work, QUERY_TIMEOUT_MS);
  } catch {
    return null;
  } finally {
    // Close the handle once `work` settles, even if the timeout won the race.
    void work.then(() => {
      if (graph !== null) void graph.close();
    });
  }
}

export function formatBlastRadius(blast: BlastRadius): string {
  if (blast.callers.length === 0) return "";
  const locations = blast.callers.map((c) => `${c.file}:${c.line}`).join(", ");
  return `\n\n${blast.callers.length} caller${
    blast.callers.length === 1 ? "" : "s"
  } depend on this: ${locations}`;
}
