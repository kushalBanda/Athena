import { readdir } from "node:fs/promises";
import path from "node:path";

const EXCLUDED_DIRS = new Set(["node_modules", ".git", "dist"]);

export async function walkFiles(root: string): Promise<string[]> {
  const results: string[] = [];

  async function walk(dir: string): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (EXCLUDED_DIRS.has(entry.name)) continue;
        await walk(path.join(dir, entry.name));
      } else if (entry.isFile()) {
        results.push(path.relative(root, path.join(dir, entry.name)));
      }
    }
  }

  await walk(root);
  return results;
}
