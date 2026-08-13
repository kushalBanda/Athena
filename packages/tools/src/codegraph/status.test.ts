import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { formatIndexStatusLine, getIndexStatus } from "./status.js";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "athena-status-test-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("getIndexStatus", () => {
  test("reports fresh:false and watcherActive:false when no index exists", () => {
    const status = getIndexStatus(dir);
    expect(status.fresh).toBe(false);
    expect(status.watcherActive).toBe(false);
    expect(status.lastSyncedAt).toBeUndefined();
  });

  test("reports fresh:true when codegraph.db exists and mtime is recent", () => {
    mkdirSync(path.join(dir, ".codegraph"));
    writeFileSync(path.join(dir, ".codegraph", "codegraph.db"), "");
    const status = getIndexStatus(dir);
    expect(status.fresh).toBe(true);
    expect(status.lastSyncedAt).toBeDefined();
  });
});

describe("formatIndexStatusLine", () => {
  test("formats a one-line human-readable summary", () => {
    const line = formatIndexStatusLine({
      fresh: true,
      watcherActive: true,
      lastSyncedAt: "2026-08-13T00:00:00.000Z",
    });
    expect(line).toContain("codegraph");
    expect(line).toContain("fresh");
  });

  test("formats absence clearly", () => {
    const line = formatIndexStatusLine({ fresh: false, watcherActive: false });
    expect(line).toContain("not indexed");
  });
});
