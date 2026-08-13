import { existsSync } from "node:fs";
import { resolveCodegraphCore } from "./core-module.js";
import { getIndexDbPath } from "./paths.js";
import { withTimeout } from "./timeout.js";
import type { CodeGraphHandle, GraphNode } from "./types.js";

export interface FederatedMatch {
  repoPath: string;
  node: GraphNode;
}

// Per-repo query bound — one slow/hung repo must never stall the others or the whole call.
const PER_REPO_TIMEOUT_MS = 1000;

// Caps concurrent SQLite handles opened via Promise.all in one call.
export const MAX_FEDERATED_REPOS = 10;

// No cross-db query exists in @colbymchenry/codegraph — each repo opens/queries/closes independently, merged after.
export async function federatedQuery(
  query: string,
  repoPaths: string[],
  options?: { maxResultsPerRepo?: number },
): Promise<FederatedMatch[]> {
  const core = resolveCodegraphCore();
  if (core === null) return [];

  const maxResultsPerRepo = options?.maxResultsPerRepo ?? 10;
  const boundedRepoPaths = repoPaths.slice(0, MAX_FEDERATED_REPOS);

  const perRepoResults = await Promise.all(
    boundedRepoPaths.map((repoPath) => queryOneRepo(core, repoPath, query, maxResultsPerRepo)),
  );

  return perRepoResults.flat();
}

async function queryOneRepo(
  core: NonNullable<ReturnType<typeof resolveCodegraphCore>>,
  repoPath: string,
  query: string,
  maxResults: number,
): Promise<FederatedMatch[]> {
  if (!existsSync(getIndexDbPath(repoPath))) return [];

  let graph: CodeGraphHandle | null = null;

  const work = (async () => {
    // open() takes the project root, not the db file — it resolves .codegraph/codegraph.db itself.
    graph = await core.CodeGraph.open(repoPath);
    const matches = graph.searchNodes(query);
    return matches.slice(0, maxResults).map((m) => ({ repoPath, node: m.node }));
  })().catch(() => [] as FederatedMatch[]);

  try {
    return (await withTimeout(work, PER_REPO_TIMEOUT_MS)) ?? [];
  } catch {
    return [];
  } finally {
    // Close the handle once `work` settles, even if the timeout won the race.
    void work.then(() => {
      if (graph !== null) void graph.close();
    });
  }
}
