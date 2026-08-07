import { spawnSync } from "node:child_process";

export interface GitInfo {
  branch: string;
  added: number;
  removed: number;
}

function run(args: string[], cwd: string): string | null {
  const result = spawnSync("git", args, { cwd, encoding: "utf-8" });
  if (result.status !== 0) return null;
  return result.stdout.trim();
}

function parseShortstat(text: string): { added: number; removed: number } {
  const insertions = /(\d+) insertion/.exec(text);
  const deletions = /(\d+) deletion/.exec(text);
  return {
    added: insertions ? Number(insertions[1]) : 0,
    removed: deletions ? Number(deletions[1]) : 0,
  };
}

export function getGitInfo(cwd: string): GitInfo | null {
  const branch = run(["rev-parse", "--abbrev-ref", "HEAD"], cwd);
  if (branch === null) return null;

  const unstaged = parseShortstat(run(["diff", "--shortstat"], cwd) ?? "");
  const staged = parseShortstat(run(["diff", "--staged", "--shortstat"], cwd) ?? "");

  return {
    branch,
    added: unstaged.added + staged.added,
    removed: unstaged.removed + staged.removed,
  };
}
