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
