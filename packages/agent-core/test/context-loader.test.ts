import { describe, expect, it } from "bun:test";
import { buildSystemPrompt } from "../src/context-loader.js";

describe("buildSystemPrompt", () => {
  it("includes cwd in base prompt", async () => {
    const prompt = await buildSystemPrompt("/my/project", "fix bugs", []);
    expect(prompt).toContain("/my/project");
  });

  it("includes custom prompt when provided", async () => {
    const prompt = await buildSystemPrompt("/tmp", "task", [], "CUSTOM_INSTRUCTIONS");
    expect(prompt).toContain("CUSTOM_INSTRUCTIONS");
  });

  it("skips codegraph when .codegraph/ absent", async () => {
    const prompt = await buildSystemPrompt("/tmp/nonexistent_proj_xyz", "task", []);
    expect(prompt).not.toContain("<code-context>");
  });

  it("includes tool names when tools provided", async () => {
    const mockTool = {
      name: "read_file",
      description: "reads a file",
      inputSchema: {},
      permission: "auto" as const,
      execute: async () => ({ content: "", isError: false }),
      toToolDef: () => ({ name: "read_file", description: "reads a file", inputSchema: {} }),
    };
    const prompt = await buildSystemPrompt("/tmp", "task", [mockTool]);
    expect(prompt).toContain("read_file");
  });

  it("includes env block with platform and date", async () => {
    const prompt = await buildSystemPrompt("/tmp", "task", []);
    expect(prompt).toContain("<env>");
    expect(prompt).toContain("Platform:");
    expect(prompt).toContain("Today's date:");
  });
});
