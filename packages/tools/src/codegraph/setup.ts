import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { appendFile, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { invalidateCodegraphCoreCache, resolveCodegraphCore } from "./core-module.js";
import { CODEGRAPH_PACKAGE_NAME, getIndexDbPath } from "./paths.js";
import type { SetupResult } from "./types.js";

const GITIGNORE_ENTRY = ".codegraph/";

function isGitRepo(cwd: string): boolean {
  return existsSync(path.join(cwd, ".git"));
}

async function ensureGitignoreEntry(cwd: string): Promise<boolean> {
  if (!isGitRepo(cwd)) return false;
  const gitignorePath = path.join(cwd, ".gitignore");

  let content = "";
  if (existsSync(gitignorePath)) {
    try {
      content = await readFile(gitignorePath, "utf-8");
    } catch {
      return false;
    }
  }

  const alreadyPresent = content
    .split("\n")
    .some((line) => line.trim() === GITIGNORE_ENTRY || line.trim() === ".codegraph");
  if (alreadyPresent) return false;

  try {
    if (content.length > 0 && !content.endsWith("\n")) {
      await appendFile(gitignorePath, `\n${GITIGNORE_ENTRY}\n`);
    } else if (content.length > 0) {
      await appendFile(gitignorePath, `${GITIGNORE_ENTRY}\n`);
    } else {
      await writeFile(gitignorePath, `${GITIGNORE_ENTRY}\n`);
    }
    return true;
  } catch {
    return false;
  }
}

function tryInstallCore(): boolean {
  try {
    // -g avoids adding a devDependency to the user's own project package.json.
    execSync(`bun add -g ${CODEGRAPH_PACKAGE_NAME}`, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function tryBuildIndex(cwd: string): boolean {
  try {
    // "init" (not "index") — first-time setup: "codegraph index" requires a
    // prior "codegraph init" and errors out otherwise. "init" does both.
    execSync("bunx codegraph init .", { cwd, stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

export async function runCodegraphSetup(cwd: string): Promise<SetupResult> {
  const result: SetupResult = {
    corePackageResolved: false,
    indexPresent: false,
    indexJustBuilt: false,
    gitignoreUpdated: false,
    watcherActive: false,
    fallback: "none",
  };

  try {
    let core = resolveCodegraphCore();
    if (core === null) {
      const installed = tryInstallCore();
      if (installed) {
        invalidateCodegraphCoreCache();
        core = resolveCodegraphCore();
      } else {
        result.error = `Failed to install ${CODEGRAPH_PACKAGE_NAME} (no network or permission).`;
      }
    }
    result.corePackageResolved = core !== null;

    // Attempted regardless of core resolution, so a failed install still leaves .gitignore updated.
    result.gitignoreUpdated = await ensureGitignoreEntry(cwd);

    if (result.corePackageResolved) {
      const dbPath = getIndexDbPath(cwd);
      result.indexPresent = existsSync(dbPath);
      if (!result.indexPresent) {
        result.indexJustBuilt = tryBuildIndex(cwd);
        result.indexPresent = result.indexJustBuilt;
      }

      // Watcher/hook activation is delegated to @colbymchenry/codegraph; getIndexStatus() confirms freshness later.
      result.watcherActive = result.indexPresent;
    }
  } catch (e) {
    result.error = e instanceof Error ? e.message : String(e);
  }

  return result;
}
