import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  formatMcpListEntry,
  formatMcpPickerOption,
  mcpAdd,
  mcpPickerEntries,
  mcpRemove,
  mcpToggle,
  splitCommand,
} from "../src/mcp-commands.js";

let originalConfigDir: string | undefined;
let configDir: string;
let projectDir: string;

beforeEach(() => {
  originalConfigDir = process.env.ATHENA_CONFIG_DIR;
  configDir = mkdtempSync(join(tmpdir(), "athena-mcp-cli-config-"));
  projectDir = mkdtempSync(join(tmpdir(), "athena-mcp-cli-project-"));
  process.env.ATHENA_CONFIG_DIR = configDir;
});

afterEach(() => {
  if (originalConfigDir === undefined) process.env.ATHENA_CONFIG_DIR = undefined;
  else process.env.ATHENA_CONFIG_DIR = originalConfigDir;
  rmSync(configDir, { recursive: true, force: true });
  rmSync(projectDir, { recursive: true, force: true });
});

describe("splitCommand", () => {
  it("splits on whitespace", () => {
    expect(splitCommand("npx some-mcp-server --flag")).toEqual(["npx", "some-mcp-server", "--flag"]);
  });

  it("respects quoted segments", () => {
    expect(splitCommand('node "my server.js" --opt')).toEqual(["node", "my server.js", "--opt"]);
  });
});

describe("mcpAdd", () => {
  it("requires either --local or --remote", () => {
    const result = mcpAdd({ name: "srv" }, projectDir);
    expect(result.ok).toBe(false);
  });

  it("rejects specifying both --local and --remote", () => {
    const result = mcpAdd({ name: "srv", local: "cmd", remote: "https://x" }, projectDir);
    expect(result.ok).toBe(false);
  });

  it("adds a local server to the global config by default", async () => {
    const result = mcpAdd({ name: "fs", local: "mcp-server-fs --root ." }, projectDir);
    expect(result.ok).toBe(true);

    const { loadGlobalMcpServers } = await import(`../src/config.js?t=${Date.now()}`);
    const servers = loadGlobalMcpServers();
    expect(servers.fs).toEqual({ type: "local", command: ["mcp-server-fs", "--root", "."] });
  });

  it("adds a remote server to the project config with --project", async () => {
    const result = mcpAdd({ name: "remote", remote: "https://example.com/mcp", project: true }, projectDir);
    expect(result.ok).toBe(true);

    const { loadProjectMcpServers } = await import(`../src/config.js?t=${Date.now()}`);
    const servers = loadProjectMcpServers(projectDir);
    expect(servers.remote).toEqual({ type: "remote", url: "https://example.com/mcp" });
  });
});

describe("mcpRemove", () => {
  it("reports not-found when the server does not exist anywhere", () => {
    const result = mcpRemove("nope", projectDir);
    expect(result.ok).toBe(false);
  });

  it("removes from project config when present there", () => {
    mcpAdd({ name: "srv", local: "cmd", project: true }, projectDir);
    const result = mcpRemove("srv", projectDir);
    expect(result.ok).toBe(true);
    expect(result.message).toContain("project");
  });

  it("removes from global config when present there", () => {
    mcpAdd({ name: "srv", local: "cmd" }, projectDir);
    const result = mcpRemove("srv", projectDir);
    expect(result.ok).toBe(true);
    expect(result.message).toContain("global");
  });
});

describe("mcpToggle", () => {
  it("disables an enabled global server, then re-enables it", () => {
    mcpAdd({ name: "srv", local: "cmd" }, projectDir);

    const off = mcpToggle("srv", projectDir);
    expect(off).toEqual({ ok: true, message: '"srv" → disabled', enabled: false });
    expect(mcpPickerEntries(projectDir)).toEqual([
      { name: "srv", scope: "global", type: "local", enabled: false },
    ]);

    const on = mcpToggle("srv", projectDir);
    expect(on).toEqual({ ok: true, message: '"srv" → enabled', enabled: true });
    expect(mcpPickerEntries(projectDir)).toEqual([
      { name: "srv", scope: "global", type: "local", enabled: true },
    ]);
  });

  it("toggles a project-scoped server without touching global config", () => {
    mcpAdd({ name: "srv", local: "cmd", project: true }, projectDir);
    const result = mcpToggle("srv", projectDir);
    expect(result).toEqual({ ok: true, message: '"srv" → disabled', enabled: false });
    expect(mcpPickerEntries(projectDir)).toEqual([
      { name: "srv", scope: "project", type: "local", enabled: false },
    ]);
  });

  it("reports not-found for an unknown server", () => {
    const result = mcpToggle("nope", projectDir);
    expect(result).toEqual({ ok: false, message: 'No MCP server named "nope" found' });
  });
});

describe("formatMcpPickerOption", () => {
  it("shows enabled state with success tone", () => {
    const opt = formatMcpPickerOption({ name: "fs", scope: "global", type: "local", enabled: true });
    expect(opt.value).toBe("fs");
    expect(opt.label).toContain("fs");
    expect(opt.hint).toBe("✓ enabled");
    expect(opt.tone).toBe("success");
  });

  it("shows disabled state with muted tone", () => {
    const opt = formatMcpPickerOption({ name: "fs", scope: "project", type: "remote", enabled: false });
    expect(opt.hint).toBe("○ disabled");
    expect(opt.tone).toBe("muted");
  });
});

describe("formatMcpListEntry", () => {
  it("formats a connected entry with tool count", () => {
    const line = formatMcpListEntry({
      name: "fs",
      scope: "global",
      type: "local",
      status: "connected",
      toolCount: 3,
    });
    expect(line).toContain("fs");
    expect(line).toContain("connected (3 tools)");
  });

  it("formats a failed entry with the error message", () => {
    const line = formatMcpListEntry({
      name: "bad",
      scope: "project",
      type: "remote",
      status: "failed",
      error: "ECONNREFUSED",
    });
    expect(line).toContain("failed: ECONNREFUSED");
  });
});
