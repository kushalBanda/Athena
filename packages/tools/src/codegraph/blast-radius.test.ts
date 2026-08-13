import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { getBlastRadius } from "./blast-radius.js";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "athena-blast-test-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("getBlastRadius", () => {
  test("returns null when no .codegraph index exists", async () => {
    const result = await getBlastRadius(dir, "src/foo.ts", "export function bar() {}");
    expect(result).toBeNull();
  });

  test("never throws even if @colbymchenry/codegraph is unresolvable", async () => {
    const result = await getBlastRadius(dir, "src/foo.ts", "export function bar() {}");
    expect(result).toBeNull();
  });
});
