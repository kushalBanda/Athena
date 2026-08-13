import { existsSync, statSync } from "node:fs";
import { getIndexDbPath } from "./paths.js";
import type { IndexStatus } from "./types.js";

// A DB older than this is considered stale even if present.
const STALE_THRESHOLD_MS = 24 * 60 * 60 * 1000; // 24h

// Tighter than STALE_THRESHOLD_MS — an mtime-recency proxy for a live watcher, not a real liveness check.
const WATCHER_ACTIVE_THRESHOLD_MS = 10 * 60 * 1000; // 10min

export function getIndexStatus(cwd: string): IndexStatus {
  const dbPath = getIndexDbPath(cwd);
  if (!existsSync(dbPath)) {
    return { fresh: false, watcherActive: false };
  }

  try {
    const stat = statSync(dbPath);
    const ageMs = Date.now() - stat.mtimeMs;
    return {
      fresh: ageMs < STALE_THRESHOLD_MS,
      watcherActive: ageMs < WATCHER_ACTIVE_THRESHOLD_MS,
      lastSyncedAt: stat.mtime.toISOString(),
    };
  } catch {
    return { fresh: false, watcherActive: false };
  }
}

export function formatIndexStatusLine(status: IndexStatus): string {
  if (!status.fresh && status.lastSyncedAt === undefined) {
    return "codegraph  : not indexed";
  }
  const freshness = status.fresh ? "fresh" : "stale";
  const watcher = status.watcherActive ? "watcher active" : "watcher inactive";
  return `codegraph  : ${freshness}, ${watcher}${
    status.lastSyncedAt ? `, last synced ${status.lastSyncedAt}` : ""
  }`;
}
