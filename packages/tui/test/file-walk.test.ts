import { describe, expect, it, beforeAll, afterAll } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { walkFiles } from "../src/lib/file-walk.js";

const root = "/tmp/athena-tui-file-walk-test";

beforeAll(() => {
  mkdirSync(`${root}/src`, { recursive: true });
  mkdirSync(`${root}/node_modules/pkg`, { recursive: true });
  mkdirSync(`${root}/.git/objects`, { recursive: true });
  mkdirSync(`${root}/dist`, { recursive: true });
  writeFileSync(`${root}/src/index.ts`, "");
  mkdirSync(`${root}/src/nested`, { recursive: true });
  writeFileSync(`${root}/src/nested/deep.ts`, "");
  writeFileSync(`${root}/package.json`, "");
  writeFileSync(`${root}/node_modules/pkg/index.js`, "");
  writeFileSync(`${root}/.git/objects/abc`, "");
  writeFileSync(`${root}/dist/bundle.js`, "");
});

afterAll(() => rmSync(root, { recursive: true, force: true }));

describe("walkFiles", () => {
  it("returns relative file paths under cwd", async () => {
    const files = await walkFiles(root);
    expect(files).toContain("src/index.ts");
    expect(files).toContain("package.json");
  });

  it("includes nested files", async () => {
    const files = await walkFiles(root);
    expect(files).toContain("src/nested/deep.ts");
  });

  it("excludes node_modules", async () => {
    const files = await walkFiles(root);
    expect(files.some((f) => f.includes("node_modules"))).toBe(false);
  });

  it("excludes .git", async () => {
    const files = await walkFiles(root);
    expect(files.some((f) => f.includes(".git"))).toBe(false);
  });

  it("excludes dist", async () => {
    const files = await walkFiles(root);
    expect(files.some((f) => f.includes("dist"))).toBe(false);
  });
});
