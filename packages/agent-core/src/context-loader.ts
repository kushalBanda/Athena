import { existsSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";
import { execSync } from "node:child_process";
import type { Tool } from "@athena/tools";
import { buildAthenaSystemPrompt } from "./system-prompt.js";
import type { Skill } from "./skills.js";
import { loadClaudeMd } from "./claude-md.js";

type CodegraphModule = {
  ContextBuilder: new (
    dbPath: string,
  ) => {
    buildContext(
      query: string,
      options?: {
        format?: "markdown" | "json";
        maxNodes?: number;
        maxCodeBlocks?: number;
        traversalDepth?: number;
      },
    ): Promise<string>;
  };
};

function isGitRepo(cwd: string): boolean {
  try {
    execSync("git rev-parse --git-dir", { cwd, stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

async function loadCodegraphContext(cwd: string, query: string): Promise<string | null> {
  const dbPath = join(cwd, ".codegraph", "index.db");
  if (!existsSync(dbPath)) return null;

  try {
    const require = createRequire(import.meta.url);
    const pkg = require("@codegraph/core") as CodegraphModule;
    const builder = new pkg.ContextBuilder(dbPath);
    return await builder.buildContext(query, {
      format: "markdown",
      maxNodes: 20,
      maxCodeBlocks: 5,
      traversalDepth: 1,
    });
  } catch {
    return null;
  }
}

export async function buildSystemPrompt(
  cwd: string,
  userMessage: string,
  tools: Tool[],
  customPrompt?: string,
  modelId?: string,
  effort?: string,
  skills?: Skill[],
  includeClaudeMd = true,
): Promise<string> {
  const codeContext = await loadCodegraphContext(cwd, userMessage);
  const claudeMdFiles = includeClaudeMd ? loadClaudeMd(cwd) : [];

  return buildAthenaSystemPrompt({
    env: {
      cwd,
      platform: process.platform,
      isGitRepo: isGitRepo(cwd),
      date: new Date().toDateString(),
      ...(modelId !== undefined ? { modelId } : {}),
      ...(effort !== undefined ? { effort } : {}),
    },
    toolNames: tools.map((t) => t.name),
    ...(customPrompt !== undefined ? { customPrompt } : {}),
    ...(codeContext !== null ? { codeContext } : {}),
    ...(skills !== undefined ? { skills } : {}),
    ...(claudeMdFiles.length > 0 ? { claudeMdFiles } : {}),
  });
}
