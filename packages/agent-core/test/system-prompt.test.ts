import { describe, expect, it } from "bun:test";
import { ATHENA_SYSTEM_PROMPT_BASE, buildAthenaSystemPrompt, buildEnvBlock, buildToolsList, formatSkillsForPrompt, formatClaudeMdForPrompt } from "../src/system-prompt.js";
import type { Skill } from "../src/skills.js";
import type { ClaudeMdFile } from "../src/claude-md.js";

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

describe("formatSkillsForPrompt", () => {
  it("returns empty string for no skills", () => {
    expect(formatSkillsForPrompt([])).toBe("");
  });

  it("formats a visible skill as an XML entry", () => {
    const skills: Skill[] = [
      { name: "my-skill", description: "Does a thing", filePath: "/skills/my-skill/SKILL.md", disableModelInvocation: false },
    ];
    const block = formatSkillsForPrompt(skills);
    expect(block).toContain("<available_skills>");
    expect(block).toContain("<name>my-skill</name>");
    expect(block).toContain("<description>Does a thing</description>");
    expect(block).toContain("<location>/skills/my-skill/SKILL.md</location>");
  });

  it("excludes skills with disableModelInvocation", () => {
    const skills: Skill[] = [
      { name: "manual", description: "Manual only", filePath: "/x", disableModelInvocation: true },
    ];
    expect(formatSkillsForPrompt(skills)).toBe("");
  });

  it("escapes XML special characters in name and description", () => {
    const skills: Skill[] = [
      { name: "a-b", description: 'Uses <tags> & "quotes"', filePath: "/x", disableModelInvocation: false },
    ];
    const block = formatSkillsForPrompt(skills);
    expect(block).toContain("&lt;tags&gt; &amp; &quot;quotes&quot;");
  });
});

describe("buildAthenaSystemPrompt with skills", () => {
  it("appends the skills block after code context", () => {
    const skills: Skill[] = [
      { name: "my-skill", description: "Does a thing", filePath: "/x/SKILL.md", disableModelInvocation: false },
    ];
    const prompt = buildAthenaSystemPrompt({ env: baseEnv, toolNames: [], skills });
    expect(prompt).toContain("<available_skills>");
  });

  it("omits the skills block when no skills provided", () => {
    const prompt = buildAthenaSystemPrompt({ env: baseEnv, toolNames: [] });
    expect(prompt).not.toContain("<available_skills>");
  });
});

describe("formatClaudeMdForPrompt", () => {
  it("returns empty string for no files", () => {
    expect(formatClaudeMdForPrompt([])).toBe("");
  });

  it("wraps each file in a project_instructions block with its path", () => {
    const files: ClaudeMdFile[] = [{ path: "/repo/CLAUDE.md", content: "Use pnpm, not npm." }];
    const block = formatClaudeMdForPrompt(files);
    expect(block).toContain("<project_context>");
    expect(block).toContain('<project_instructions path="/repo/CLAUDE.md">');
    expect(block).toContain("Use pnpm, not npm.");
    expect(block).toContain("</project_instructions>");
    expect(block).toContain("</project_context>");
  });

  it("preserves file order (root-most first) in the output", () => {
    const files: ClaudeMdFile[] = [
      { path: "/repo/CLAUDE.md", content: "Root rule." },
      { path: "/repo/pkg/CLAUDE.md", content: "Package rule." },
    ];
    const block = formatClaudeMdForPrompt(files);
    expect(block.indexOf("Root rule.")).toBeLessThan(block.indexOf("Package rule."));
  });
});

describe("buildAthenaSystemPrompt with CLAUDE.md files", () => {
  it("appends the project_context block when files are provided", () => {
    const files: ClaudeMdFile[] = [{ path: "/repo/CLAUDE.md", content: "Root rule." }];
    const prompt = buildAthenaSystemPrompt({ env: baseEnv, toolNames: [], claudeMdFiles: files });
    expect(prompt).toContain("<project_context>");
  });

  it("omits the block when no files are provided", () => {
    const prompt = buildAthenaSystemPrompt({ env: baseEnv, toolNames: [] });
    expect(prompt).not.toContain("<project_context>");
  });
});

describe("CLAUDE.md section", () => {
  it("documents the automatic injection and precedence rule", () => {
    expect(ATHENA_SYSTEM_PROMPT_BASE).toContain("CLAUDE.md");
    expect(ATHENA_SYSTEM_PROMPT_BASE).toMatch(/deeper|more specific/i);
  });
});
