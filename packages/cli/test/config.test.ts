import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

let originalConfigDir: string | undefined;
let tempDir: string;

beforeEach(() => {
  originalConfigDir = process.env.ATHENA_CONFIG_DIR;
  tempDir = mkdtempSync(join(tmpdir(), "athena-config-test-"));
  process.env.ATHENA_CONFIG_DIR = tempDir;
});

afterEach(() => {
  if (originalConfigDir === undefined) process.env.ATHENA_CONFIG_DIR = undefined;
  else process.env.ATHENA_CONFIG_DIR = originalConfigDir;
  rmSync(tempDir, { recursive: true, force: true });
});

describe("observability config", () => {
  it("defaults to disabled, no endpoint/preset, when nothing is saved", async () => {
    const { loadObservabilityConfig } = await import(`../src/config.js?t=${Date.now()}`);
    const result = loadObservabilityConfig();
    expect(result).toEqual({ enabled: false });
  });

  it("round-trips enabled + otlpEndpoint + backendPreset through save/load", async () => {
    const { loadObservabilityConfig, saveObservabilityConfig } = await import(
      `../src/config.js?t=${Date.now()}`
    );
    saveObservabilityConfig({
      enabled: true,
      otlpEndpoint: "https://otlp.eu01.nr-data.net:4318/v1/traces",
      backendPreset: "new-relic",
    });
    const result = loadObservabilityConfig();
    expect(result).toEqual({
      enabled: true,
      otlpEndpoint: "https://otlp.eu01.nr-data.net:4318/v1/traces",
      backendPreset: "new-relic",
    });
  });
});

describe("context sources config", () => {
  it("defaults every source to enabled when nothing is saved", async () => {
    const { loadContextSourcesConfig } = await import(`../src/config.js?t=${Date.now()}`);
    expect(loadContextSourcesConfig()).toEqual({
      claudeSkills: true,
      claudeMd: true,
    });
  });

  it("round-trips a partial toggle through save/load, leaving other sources at their default", async () => {
    const { loadContextSourcesConfig, saveContextSourcesConfig } = await import(
      `../src/config.js?t=${Date.now()}`
    );
    saveContextSourcesConfig({ claudeSkills: false });
    expect(loadContextSourcesConfig()).toEqual({
      claudeSkills: false,
      claudeMd: true,
    });
  });

  it("re-enabling a previously disabled source flips it back", async () => {
    const { loadContextSourcesConfig, saveContextSourcesConfig } = await import(
      `../src/config.js?t=${Date.now()}`
    );
    saveContextSourcesConfig({ claudeSkills: false });
    saveContextSourcesConfig({ claudeSkills: true });
    expect(loadContextSourcesConfig()).toEqual({
      claudeSkills: true,
      claudeMd: true,
    });
  });

  it("defaults claudeMd to true and can be toggled off", async () => {
    const { loadContextSourcesConfig, saveContextSourcesConfig } = await import(
      `../src/config.js?t=${Date.now()}`
    );
    expect(loadContextSourcesConfig().claudeMd).toBe(true);
    saveContextSourcesConfig({ claudeMd: false });
    expect(loadContextSourcesConfig().claudeMd).toBe(false);
  });
});

describe("permissions config", () => {
  it("defaults to an empty always-allow list when nothing is saved", async () => {
    const { loadPermissionsConfig } = await import(`../src/config.js?t=${Date.now()}`);
    expect(loadPermissionsConfig()).toEqual({ alwaysAllow: [] });
  });

  it("round-trips a saved tool name through save/load", async () => {
    const { loadPermissionsConfig, saveAlwaysAllow } = await import(
      `../src/config.js?t=${Date.now()}`
    );
    saveAlwaysAllow("shell_exec");
    expect(loadPermissionsConfig()).toEqual({ alwaysAllow: ["shell_exec"] });
  });

  it("accumulates distinct tool names across multiple saves", async () => {
    const { loadPermissionsConfig, saveAlwaysAllow } = await import(
      `../src/config.js?t=${Date.now()}`
    );
    saveAlwaysAllow("shell_exec");
    saveAlwaysAllow("web_fetch");
    expect(loadPermissionsConfig()).toEqual({ alwaysAllow: ["shell_exec", "web_fetch"] });
  });

  it("does not duplicate an entry when the same tool name is saved twice", async () => {
    const { loadPermissionsConfig, saveAlwaysAllow } = await import(
      `../src/config.js?t=${Date.now()}`
    );
    saveAlwaysAllow("shell_exec");
    saveAlwaysAllow("shell_exec");
    expect(loadPermissionsConfig()).toEqual({ alwaysAllow: ["shell_exec"] });
  });
});
