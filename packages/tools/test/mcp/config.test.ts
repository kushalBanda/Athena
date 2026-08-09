import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  loadMcpConfig,
  mergeMcpConfigs,
  readGlobalMcpConfig,
  readProjectMcpConfig,
  isServerEnabled,
} from "../../src/mcp/config.js";

describe("mcp config", () => {
  let dir: string;
  let originalConfigDir: string | undefined;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "athena-mcp-test-"));
    originalConfigDir = process.env.ATHENA_CONFIG_DIR;
    process.env.ATHENA_CONFIG_DIR = join(dir, "config-home");
    mkdirSync(process.env.ATHENA_CONFIG_DIR, { recursive: true });
  });

  afterEach(() => {
    if (originalConfigDir === undefined) delete process.env.ATHENA_CONFIG_DIR;
    else process.env.ATHENA_CONFIG_DIR = originalConfigDir;
    rmSync(dir, { recursive: true, force: true });
  });

  it("returns empty config when no files exist", () => {
    expect(readGlobalMcpConfig()).toEqual({});
    expect(readProjectMcpConfig(dir)).toEqual({});
    expect(loadMcpConfig(dir)).toEqual({});
  });

  it("reads the mcp block from global config.json", () => {
    writeFileSync(
      join(process.env.ATHENA_CONFIG_DIR!, "config.json"),
      JSON.stringify({
        provider: "anthropic",
        mcp: {
          filesystem: { type: "local", command: ["mcp-fs"] },
        },
      }),
    );
    const global = readGlobalMcpConfig();
    expect(global.filesystem).toEqual({ type: "local", command: ["mcp-fs"] });
  });

  it("reads project-local .athena/mcp.json", () => {
    mkdirSync(join(dir, ".athena"), { recursive: true });
    writeFileSync(
      join(dir, ".athena", "mcp.json"),
      JSON.stringify({ remote: { type: "remote", url: "https://example.com/mcp" } }),
    );
    const project = readProjectMcpConfig(dir);
    expect(project.remote).toEqual({ type: "remote", url: "https://example.com/mcp" });
  });

  it("ignores entries with an invalid shape", () => {
    mkdirSync(join(dir, ".athena"), { recursive: true });
    writeFileSync(
      join(dir, ".athena", "mcp.json"),
      JSON.stringify({ broken: { type: "local" }, ok: { type: "remote", url: "https://x" } }),
    );
    const project = readProjectMcpConfig(dir);
    expect(project.broken).toBeUndefined();
    expect(project.ok).toBeDefined();
  });

  it("project-local entries override global entries with the same name", () => {
    const merged = mergeMcpConfigs(
      { shared: { type: "local", command: ["global-cmd"] } },
      { shared: { type: "local", command: ["project-cmd"] } },
    );
    expect(merged.shared).toEqual({ type: "local", command: ["project-cmd"] });
  });

  it("merges global and project configs end to end via loadMcpConfig", () => {
    writeFileSync(
      join(process.env.ATHENA_CONFIG_DIR!, "config.json"),
      JSON.stringify({ mcp: { a: { type: "local", command: ["a"] }, shared: { type: "local", command: ["global"] } } }),
    );
    mkdirSync(join(dir, ".athena"), { recursive: true });
    writeFileSync(
      join(dir, ".athena", "mcp.json"),
      JSON.stringify({ shared: { type: "local", command: ["project"] }, b: { type: "remote", url: "https://x" } }),
    );

    const merged = loadMcpConfig(dir);
    expect(Object.keys(merged).sort()).toEqual(["a", "b", "shared"]);
    expect(merged.shared).toEqual({ type: "local", command: ["project"] });
  });

  it("isServerEnabled defaults to true when `enabled` is unset", () => {
    expect(isServerEnabled({ type: "local", command: ["x"] })).toBe(true);
    expect(isServerEnabled({ type: "local", command: ["x"], enabled: false })).toBe(false);
    expect(isServerEnabled({ type: "local", command: ["x"], enabled: true })).toBe(true);
  });
});
