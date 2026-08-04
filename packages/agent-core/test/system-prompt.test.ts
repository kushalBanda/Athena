import { describe, expect, it } from "bun:test";
import { buildAthenaSystemPrompt, buildEnvBlock, buildToolsList } from "../src/system-prompt.js";

const baseEnv = {
  cwd: "/my/project",
  platform: "darwin" as NodeJS.Platform,
  isGitRepo: true,
  date: "Mon Jul 28 2026",
};

describe("buildEnvBlock", () => {
  it("includes all env fields", () => {
    const block = buildEnvBlock(baseEnv);
    expect(block).toContain("/my/project");
    expect(block).toContain("darwin");
    expect(block).toContain("yes");
    expect(block).toContain("Mon Jul 28 2026");
  });

  it("reflects non-git repo correctly", () => {
    const block = buildEnvBlock({ ...baseEnv, isGitRepo: false });
    expect(block).toContain("no");
  });

  it("includes model id when provided", () => {
    const block = buildEnvBlock({ ...baseEnv, modelId: "claude-sonnet-4-6" });
    expect(block).toContain("claude-sonnet-4-6");
  });
});

describe("buildToolsList", () => {
  it("formats tool names as bullet list", () => {
    const list = buildToolsList(["read_file", "write_file"]);
    expect(list).toContain("- read_file");
    expect(list).toContain("- write_file");
  });

  it("returns (none) for empty tools", () => {
    expect(buildToolsList([])).toBe("(none)");
  });
});

describe("buildAthenaSystemPrompt", () => {
  it("contains Athena identity", () => {
    const prompt = buildAthenaSystemPrompt({ env: baseEnv, toolNames: [] });
    expect(prompt).toContain("You are Athena");
  });

  it("includes env block", () => {
    const prompt = buildAthenaSystemPrompt({ env: baseEnv, toolNames: [] });
    expect(prompt).toContain("<env>");
    expect(prompt).toContain("/my/project");
  });

  it("includes tool names section when tools provided", () => {
    const prompt = buildAthenaSystemPrompt({ env: baseEnv, toolNames: ["read_file", "grep"] });
    expect(prompt).toContain("# Available tools");
    expect(prompt).toContain("- read_file");
    expect(prompt).toContain("- grep");
  });

  it("omits tool section when no tools", () => {
    const prompt = buildAthenaSystemPrompt({ env: baseEnv, toolNames: [] });
    expect(prompt).not.toContain("# Available tools");
  });

  it("injects code-context block when provided", () => {
    const prompt = buildAthenaSystemPrompt({
      env: baseEnv,
      toolNames: [],
      codeContext: "## Symbol: Foo\n```ts\nclass Foo {}\n```",
    });
    expect(prompt).toContain("<code-context>");
    expect(prompt).toContain("class Foo {}");
    expect(prompt).toContain("</code-context>");
  });

  it("appends custom prompt at end", () => {
    const prompt = buildAthenaSystemPrompt({
      env: baseEnv,
      toolNames: [],
      customPrompt: "ALWAYS_REPLY_IN_HAIKU",
    });
    expect(prompt).toContain("ALWAYS_REPLY_IN_HAIKU");
    expect(prompt.indexOf("ALWAYS_REPLY_IN_HAIKU")).toBeGreaterThan(prompt.indexOf("<env>"));
  });

  it("contains key behavioral rules", () => {
    const prompt = buildAthenaSystemPrompt({ env: baseEnv, toolNames: [] });
    expect(prompt).toContain("NEVER commit");
    expect(prompt).toContain("NEVER assume a library");
    expect(prompt).toContain("package.json");
  });
});
