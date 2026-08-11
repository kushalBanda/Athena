import { execSync } from "node:child_process";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const MAX_ANCESTOR_DEPTH = 20;

export interface ClaudeMdFile {
  path: string;
  content: string;
}

function findGitRoot(cwd: string): string | null {
  try {
    const out = execSync("git rev-parse --show-toplevel", {
      cwd,
      stdio: ["ignore", "pipe", "ignore"],
    });
    return out.toString("utf-8").trim() || null;
  } catch {
    return null;
  }
}

function collectAncestors(cwd: string, stopAt: string): string[] {
  const dirs: string[] = [];
  let current = resolve(cwd);
  const boundary = resolve(stopAt);

  for (let i = 0; i < MAX_ANCESTOR_DEPTH; i++) {
    dirs.push(current);
    if (current === boundary) break;
    const parent = dirname(current);
    if (parent === current) break; // filesystem root
    current = parent;
  }

  return dirs.reverse(); // root-most first
}

function realpathOrSelf(p: string): string {
  try {
    return realpathSync(p);
  } catch {
    return p;
  }
}

export function loadClaudeMd(cwd: string): ClaudeMdFile[] {
  const resolvedCwd = realpathOrSelf(resolve(cwd));
  const gitRoot = findGitRoot(resolvedCwd);
  const ancestorDirs = gitRoot
    ? collectAncestors(resolvedCwd, realpathOrSelf(gitRoot))
    : [resolvedCwd];

  const files: ClaudeMdFile[] = [];
  for (const dir of ancestorDirs) {
    const candidate = join(dir, "CLAUDE.md");
    if (!existsSync(candidate)) continue;
    try {
      files.push({ path: candidate, content: readFileSync(candidate, "utf-8") });
    } catch {}
  }

  return files;
}
