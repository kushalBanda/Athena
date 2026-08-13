import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import path from "node:path";
import { CODEGRAPH_PACKAGE_NAME } from "./paths.js";
import type { CodegraphModule } from "./types.js";

let cached: CodegraphModule | null | undefined;

function globalBunInstallPath(): string {
  const bunInstallRoot = process.env.BUN_INSTALL ?? path.join(homedir(), ".bun");
  return path.join(bunInstallRoot, "install", "global", "node_modules", CODEGRAPH_PACKAGE_NAME);
}

export function resolveCodegraphCore(): CodegraphModule | null {
  if (cached !== undefined) return cached;
  const require = createRequire(import.meta.url);

  try {
    cached = require(CODEGRAPH_PACKAGE_NAME) as CodegraphModule;
    return cached;
  } catch {}

  try {
    const globalPath = globalBunInstallPath();
    if (existsSync(globalPath)) {
      cached = require(globalPath) as CodegraphModule;
      return cached;
    }
  } catch {}

  cached = null;
  return cached;
}

// Forces the next resolveCodegraphCore() call to re-resolve instead of returning a stale
// cached null — needed after installing the package mid-process (setup.ts), and in tests.
export function invalidateCodegraphCoreCache(): void {
  cached = undefined;
}
