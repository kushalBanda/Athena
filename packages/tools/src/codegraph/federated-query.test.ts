import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { MAX_FEDERATED_REPOS, federatedQuery } from "./federated-query.js";

let dirA: string;
let dirB: string;

beforeEach(() => {
  dirA = mkdtempSync(path.join(tmpdir(), "athena-fed-a-"));
  dirB = mkdtempSync(path.join(tmpdir(), "athena-fed-b-"));
});

afterEach(() => {
  rmSync(dirA, { recursive: true, force: true });
  rmSync(dirB, { recursive: true, force: true });
});

describe("federatedQuery", () => {
  test("returns an empty array when no repos have a .codegraph index", async () => {
    const result = await federatedQuery("foo", [dirA, dirB]);
    expect(result).toEqual([]);
  });

  test("never throws for a mix of missing/nonexistent repo paths", async () => {
    const result = await federatedQuery("foo", [dirA, "/nonexistent/path/xyz"]);
    expect(result).toEqual([]);
  });

  test("returns empty array for an empty repoPaths list", async () => {
    const result = await federatedQuery("foo", []);
    expect(result).toEqual([]);
  });

  test("never throws when repoPaths exceeds MAX_FEDERATED_REPOS — extras are dropped, not queried", async () => {
    const manyPaths = Array.from(
      { length: MAX_FEDERATED_REPOS + 50 },
      (_, i) => `/nonexistent-${i}`,
    );
    const result = await federatedQuery("foo", manyPaths);
    expect(result).toEqual([]);
  });
});
