import type { Component } from "../tui.ts";
import { defaultTheme } from "../theme.ts";
import { truncateToWidth } from "../utils.ts";

export interface GitInfo {
  branch: string;
  added: number;
  removed: number;
}

function run(args: string[], cwd: string): string | null {
  // Bun.spawnSync throws (not just exits non-zero) if cwd is missing or git can't spawn.
  try {
    const result = Bun.spawnSync(["git", ...args], { cwd });
    if (result.exitCode !== 0) return null;
    return result.stdout.toString().trim();
  } catch {
    return null;
  }
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

export function displayCwd(cwd: string): string {
  const home = process.env.HOME ?? "";
  return home && cwd.startsWith(home) ? `~${cwd.slice(home.length)}` : cwd;
}

export class Header implements Component {
  private cwd: string;
  private git: GitInfo | null;

  constructor(cwd: string) {
    this.cwd = cwd;
    this.git = getGitInfo(cwd);
  }

  setCwd(cwd: string): void {
    this.cwd = cwd;
    this.git = getGitInfo(cwd);
    this.invalidate();
  }

  render(width: number): string[] {
    const parts = [defaultTheme.text.primary(displayCwd(this.cwd))];
    if (this.git) {
      parts.push(defaultTheme.text.muted(" · "));
      parts.push(defaultTheme.text.accent(this.git.branch));
      if (this.git.added > 0) parts.push(defaultTheme.status.working(` +${this.git.added}`));
      if (this.git.removed > 0) parts.push(defaultTheme.status.error(` -${this.git.removed}`));
    }
    return [truncateToWidth(parts.join(""), width)];
  }

  invalidate(): void {
    // Static content per render pass — nothing to invalidate.
  }
}
