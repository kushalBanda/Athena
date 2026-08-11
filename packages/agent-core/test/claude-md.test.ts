import { describe, expect, it, beforeAll, afterAll } from "bun:test";
import { execSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadClaudeMd } from "../src/claude-md.js";

const tmpRoot = "/tmp/athena-claude-md-test";
const repoRoot = join(tmpRoot, "repo");
const subDir = join(repoRoot, "packages", "widgets");

beforeAll(() => {
  mkdirSync(subDir, { recursive: true });
  execSync("git init -q", { cwd: repoRoot });
});

afterAll(() => rmSync(tmpRoot, { recursive: true, force: true }));

describe("loadClaudeMd", () => {
  it("returns an empty array when no CLAUDE.md exists anywhere in the ancestry", () => {
    expect(loadClaudeMd(subDir)).toEqual([]);
  });

  it("finds a single CLAUDE.md at the git root", () => {
    writeFileSync(join(repoRoot, "CLAUDE.md"), "Root instructions.");
    const files = loadClaudeMd(subDir);
    expect(files).toHaveLength(1);
    expect(files[0]?.content).toBe("Root instructions.");
    rmSync(join(repoRoot, "CLAUDE.md"));
  });

  it("orders root-most first, cwd-most last, when multiple CLAUDE.md exist", () => {
    writeFileSync(join(repoRoot, "CLAUDE.md"), "Root instructions.");
    mkdirSync(join(repoRoot, "packages"), { recursive: true });
    writeFileSync(join(repoRoot, "packages", "CLAUDE.md"), "Packages instructions.");
    writeFileSync(join(subDir, "CLAUDE.md"), "Widgets instructions.");

    const files = loadClaudeMd(subDir);
    expect(files.map((f) => f.content)).toEqual([
      "Root instructions.",
      "Packages instructions.",
      "Widgets instructions.",
    ]);

    rmSync(join(repoRoot, "CLAUDE.md"));
    rmSync(join(repoRoot, "packages", "CLAUDE.md"));
    rmSync(join(subDir, "CLAUDE.md"));
  });

  it("does not walk above the git root", () => {
    writeFileSync(join(tmpRoot, "CLAUDE.md"), "Outside the repo, must not load.");
    const files = loadClaudeMd(subDir);
    expect(files.some((f) => f.content.includes("Outside the repo"))).toBe(false);
    rmSync(join(tmpRoot, "CLAUDE.md"));
  });

  it("falls back to the given cwd only when not inside a git repo", () => {
    const nonGitDir = join(tmpRoot, "non-git");
    mkdirSync(nonGitDir, { recursive: true });
    writeFileSync(join(nonGitDir, "CLAUDE.md"), "Non-git instructions.");
    const files = loadClaudeMd(nonGitDir);
    expect(files).toHaveLength(1);
    expect(files[0]?.content).toBe("Non-git instructions.");
  });
});
