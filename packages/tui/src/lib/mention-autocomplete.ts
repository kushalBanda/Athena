import fuzzysort from "fuzzysort";

const DEFAULT_LIMIT = 10;

/** Ranks candidate file paths against `query` for @-mention autocomplete. */
export function rankMentionCandidates(candidates: string[], query: string, limit: number = DEFAULT_LIMIT): string[] {
  if (query === "") return candidates.slice(0, limit);

  const results = fuzzysort.go(query, candidates, { limit, threshold: -10000 });
  return results.map((r) => r.target);
}
