import path from "node:path";

// Real published package (verified against docs/resources/codegraph/package.json) — not "@codegraph/core".
export const CODEGRAPH_PACKAGE_NAME = "@colbymchenry/codegraph";

// Matches getDatabasePath()/getCodeGraphDir() in @colbymchenry/codegraph — not "index.db".
export function getIndexDbPath(projectRoot: string): string {
  return path.join(projectRoot, ".codegraph", "codegraph.db");
}
