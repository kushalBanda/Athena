import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

let originalConfigDir: string | undefined;
let tempDir: string;

beforeEach(() => {
  originalConfigDir = process.env.ATHENA_CONFIG_DIR;
  tempDir = mkdtempSync(join(tmpdir(), "athena-auth-test-"));
  process.env.ATHENA_CONFIG_DIR = tempDir;
});

afterEach(() => {
  if (originalConfigDir === undefined) delete process.env.ATHENA_CONFIG_DIR;
  else process.env.ATHENA_CONFIG_DIR = originalConfigDir;
  rmSync(tempDir, { recursive: true, force: true });
});

describe("OTLP headers", () => {
  it("returns undefined when nothing is stored", async () => {
    const { getOtlpHeaders } = await import(`../src/auth.js?t=${Date.now()}`);
    expect(getOtlpHeaders()).toBeUndefined();
  });

  it("round-trips stored headers", async () => {
    const { getOtlpHeaders, setOtlpHeaders } = await import(`../src/auth.js?t=${Date.now()}`);
    setOtlpHeaders({ "api-key": "nr-test-key-123" });
    expect(getOtlpHeaders()).toEqual({ "api-key": "nr-test-key-123" });
  });
});
