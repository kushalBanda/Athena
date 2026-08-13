import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { getIndexDbPath, resolveCodegraphCore } from "@athena/tools";
import type { Tool } from "@athena/tools";
import { loadClaudeMd } from "./claude-md.js";
import type { Skill } from "./skills.js";
import { buildAthenaSystemPrompt } from "./system-prompt.js";

function isGitRepo(cwd: string): boolean {
  try {
    execSync("git rev-parse --git-dir", { cwd, stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

async function loadCodegraphContext(cwd: string, query: string): Promise<string | null> {
  if (!existsSync(getIndexDbPath(cwd))) return null;

  const core = resolveCodegraphCore();
  if (core === null) return null;

  let graph: Awaited<ReturnType<typeof core.CodeGraph.open>> | null = null;
  try {
    // open() takes the project root, not the db file — it resolves .codegraph/codegraph.db itself.
    graph = await core.CodeGraph.open(cwd);
    return await graph.buildContext(query, {
      format: "markdown",
      maxNodes: 20,
      maxCodeBlocks: 5,
      traversalDepth: 1,
    });
  } catch {
    return null;
  } finally {
    if (graph !== null) graph.close();
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
