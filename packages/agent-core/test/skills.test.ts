import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadSkills } from "../src/skills.js";

const tmpRoot = "/tmp/athena-skills-test";
const userDir = join(tmpRoot, "user-agent-dir");
const projectDir = join(tmpRoot, "project-cwd");
// Isolate from the real ~/.claude and ~/.codex — loadSkills now scans those too.
const isolatedHome = join(tmpRoot, "isolated-home");

function writeSkill(dir: string, relPath: string, frontmatter: string, body = "Body.") {
  const full = join(dir, relPath);
  mkdirSync(full.slice(0, full.lastIndexOf("/")), { recursive: true });
  writeFileSync(full, `---\n${frontmatter}\n---\n${body}`);
}

beforeEach(() => {
  mkdirSync(userDir, { recursive: true });
  mkdirSync(projectDir, { recursive: true });
});

afterEach(() => rmSync(tmpRoot, { recursive: true, force: true }));

describe("loadSkills", () => {
  it("loads a skill from a SKILL.md in a named subdirectory (name falls back to dir name)", () => {
    writeSkill(userDir, "skills/my-skill/SKILL.md", "description: Does a thing");
    const skills = loadSkills({ cwd: projectDir, agentDir: userDir, homeDir: isolatedHome });
    const skill = skills.find((s) => s.name === "my-skill");
    expect(skill).toBeDefined();
    expect(skill?.description).toBe("Does a thing");
  });

  it("loads a loose root-level .md file as a skill", () => {
    writeSkill(userDir, "skills/quick-tip.md", "name: quick-tip\ndescription: A quick tip");
    const skills = loadSkills({ cwd: projectDir, agentDir: userDir, homeDir: isolatedHome });
    expect(skills.some((s) => s.name === "quick-tip")).toBe(true);
  });

  it("does not recurse past a directory that already contains SKILL.md", () => {
    writeSkill(userDir, "skills/outer/SKILL.md", "description: Outer skill");
    writeSkill(userDir, "skills/outer/nested/SKILL.md", "description: Should not load");
    const skills = loadSkills({ cwd: projectDir, agentDir: userDir, homeDir: isolatedHome });
    expect(skills.filter((s) => s.name === "outer")).toHaveLength(1);
    expect(skills.some((s) => s.description === "Should not load")).toBe(false);
  });

  it("skips a skill with no description", () => {
    writeSkill(userDir, "skills/broken/SKILL.md", "name: broken");
    const skills = loadSkills({ cwd: projectDir, agentDir: userDir, homeDir: isolatedHome });
    expect(skills.some((s) => s.name === "broken")).toBe(false);
  });

  it("respects .gitignore inside the scanned skills directory", () => {
    writeSkill(userDir, "skills/ignored/SKILL.md", "description: Should be ignored");
    writeFileSync(join(userDir, "skills", ".gitignore"), "ignored/\n");
    const skills = loadSkills({ cwd: projectDir, agentDir: userDir, homeDir: isolatedHome });
    expect(skills.some((s) => s.name === "ignored")).toBe(false);
  });

  it("project skill wins over user skill on name collision", () => {
    writeSkill(userDir, "skills/shared/SKILL.md", "description: User version");
    writeSkill(projectDir, ".athena/skills/shared/SKILL.md", "description: Project version");
    const skills = loadSkills({ cwd: projectDir, agentDir: userDir, homeDir: isolatedHome });
    const shared = skills.filter((s) => s.name === "shared");
    expect(shared).toHaveLength(1);
    expect(shared[0]?.description).toBe("Project version");
  });

  it("sets disableModelInvocation from frontmatter", () => {
    writeSkill(userDir, "skills/manual/SKILL.md", "description: Manual only\ndisable-model-invocation: true");
    const skills = loadSkills({ cwd: projectDir, agentDir: userDir, homeDir: isolatedHome });
    expect(skills.find((s) => s.name === "manual")?.disableModelInvocation).toBe(true);
  });

  it("returns an empty array when no discovery directory exists", () => {
    rmSync(tmpRoot, { recursive: true, force: true });
    expect(
      loadSkills({
        cwd: "/tmp/athena-skills-nonexistent-cwd",
        agentDir: "/tmp/athena-skills-nonexistent-agent",
        homeDir: "/tmp/athena-skills-nonexistent-home",
      }),
    ).toEqual([]);
  });
});

describe("loadSkills — ecosystem interop (.claude, .codex)", () => {
  const fakeHome = join(tmpRoot, "fake-home");
  const priorCodexHome = process.env.CODEX_HOME;

  beforeEach(() => {
    mkdirSync(fakeHome, { recursive: true });
    delete process.env.CODEX_HOME;
  });

  afterEach(() => {
    if (priorCodexHome !== undefined) process.env.CODEX_HOME = priorCodexHome;
    else delete process.env.CODEX_HOME;
  });

  it("loads a user-level skill from ~/.claude/skills", () => {
    writeSkill(fakeHome, ".claude/skills/from-claude/SKILL.md", "description: From claude");
    const skills = loadSkills({ cwd: projectDir, agentDir: userDir, homeDir: fakeHome });
    expect(skills.some((s) => s.name === "from-claude" && s.description === "From claude")).toBe(true);
  });

  it("loads a user-level skill from ~/.codex/skills", () => {
    writeSkill(fakeHome, ".codex/skills/from-codex/SKILL.md", "description: From codex");
    const skills = loadSkills({ cwd: projectDir, agentDir: userDir, homeDir: fakeHome });
    expect(skills.some((s) => s.name === "from-codex" && s.description === "From codex")).toBe(true);
  });

  it("respects CODEX_HOME override for the codex skills dir", () => {
    const customCodexHome = join(tmpRoot, "custom-codex-home");
    writeSkill(customCodexHome, "skills/from-custom-codex/SKILL.md", "description: Custom codex home");
    process.env.CODEX_HOME = customCodexHome;
    const skills = loadSkills({ cwd: projectDir, agentDir: userDir, homeDir: fakeHome });
    expect(skills.some((s) => s.name === "from-custom-codex")).toBe(true);
  });

  it("loads a project-level skill from <cwd>/.claude/skills and <cwd>/.codex/skills", () => {
    writeSkill(projectDir, ".claude/skills/proj-claude/SKILL.md", "description: Project claude skill");
    writeSkill(projectDir, ".codex/skills/proj-codex/SKILL.md", "description: Project codex skill");
    const skills = loadSkills({ cwd: projectDir, agentDir: userDir, homeDir: fakeHome });
    expect(skills.some((s) => s.name === "proj-claude")).toBe(true);
    expect(skills.some((s) => s.name === "proj-codex")).toBe(true);
  });

  it("athena's own skill wins over a same-named claude/codex skill in the same scope", () => {
    writeSkill(fakeHome, ".claude/skills/shared/SKILL.md", "description: Claude version");
    writeSkill(fakeHome, ".codex/skills/shared/SKILL.md", "description: Codex version");
    writeSkill(userDir, "skills/shared/SKILL.md", "description: Athena version");
    const skills = loadSkills({ cwd: projectDir, agentDir: userDir, homeDir: fakeHome });
    const shared = skills.filter((s) => s.name === "shared");
    expect(shared).toHaveLength(1);
    expect(shared[0]?.description).toBe("Athena version");
  });

  it("a project-level claude/codex skill still wins over any user-level skill", () => {
    writeSkill(fakeHome, ".claude/skills/shared/SKILL.md", "description: User claude version");
    writeSkill(projectDir, ".codex/skills/shared/SKILL.md", "description: Project codex version");
    const skills = loadSkills({ cwd: projectDir, agentDir: userDir, homeDir: fakeHome });
    const shared = skills.filter((s) => s.name === "shared");
    expect(shared).toHaveLength(1);
    expect(shared[0]?.description).toBe("Project codex version");
  });

  it("loads a user-level skill from ~/.cursor/skills", () => {
    writeSkill(fakeHome, ".cursor/skills/from-cursor/SKILL.md", "description: From cursor");
    const skills = loadSkills({ cwd: projectDir, agentDir: userDir, homeDir: fakeHome });
    expect(skills.some((s) => s.name === "from-cursor" && s.description === "From cursor")).toBe(true);
  });

  it("loads a project-level skill from <cwd>/.cursor/skills", () => {
    writeSkill(projectDir, ".cursor/skills/proj-cursor/SKILL.md", "description: Project cursor skill");
    const skills = loadSkills({ cwd: projectDir, agentDir: userDir, homeDir: fakeHome });
    expect(skills.some((s) => s.name === "proj-cursor")).toBe(true);
  });
});

describe("loadSkills — source/scope tagging", () => {
  const fakeHome = join(tmpRoot, "fake-home-tagging");

  beforeEach(() => mkdirSync(fakeHome, { recursive: true }));

  it("tags an athena-native user skill with source athena, scope user", () => {
    writeSkill(userDir, "skills/native/SKILL.md", "description: Native skill");
    const skills = loadSkills({ cwd: projectDir, agentDir: userDir, homeDir: fakeHome });
    const skill = skills.find((s) => s.name === "native");
    expect(skill?.source).toBe("athena");
    expect(skill?.scope).toBe("user");
  });

  it("tags an athena-native project skill with source athena, scope project", () => {
    writeSkill(projectDir, ".athena/skills/native-proj/SKILL.md", "description: Native project skill");
    const skills = loadSkills({ cwd: projectDir, agentDir: userDir, homeDir: fakeHome });
    const skill = skills.find((s) => s.name === "native-proj");
    expect(skill?.source).toBe("athena");
    expect(skill?.scope).toBe("project");
  });

  it("tags a claude skill with source claude, and a project claude skill with scope project", () => {
    writeSkill(fakeHome, ".claude/skills/user-claude/SKILL.md", "description: User claude");
    writeSkill(projectDir, ".claude/skills/proj-claude/SKILL.md", "description: Project claude");
    const skills = loadSkills({ cwd: projectDir, agentDir: userDir, homeDir: fakeHome });
    expect(skills.find((s) => s.name === "user-claude")?.source).toBe("claude");
    expect(skills.find((s) => s.name === "user-claude")?.scope).toBe("user");
    expect(skills.find((s) => s.name === "proj-claude")?.scope).toBe("project");
  });

  it("tags a codex skill with source codex and a cursor skill with source cursor", () => {
    writeSkill(fakeHome, ".codex/skills/from-codex/SKILL.md", "description: From codex");
    writeSkill(fakeHome, ".cursor/skills/from-cursor/SKILL.md", "description: From cursor");
    const skills = loadSkills({ cwd: projectDir, agentDir: userDir, homeDir: fakeHome });
    expect(skills.find((s) => s.name === "from-codex")?.source).toBe("codex");
    expect(skills.find((s) => s.name === "from-cursor")?.source).toBe("cursor");
  });
});

describe("loadSkills — enabledSources toggle", () => {
  const fakeHome = join(tmpRoot, "fake-home-toggle");

  beforeEach(() => {
    mkdirSync(fakeHome, { recursive: true });
    writeSkill(fakeHome, ".claude/skills/claude-skill/SKILL.md", "description: Claude skill");
    writeSkill(fakeHome, ".codex/skills/codex-skill/SKILL.md", "description: Codex skill");
    writeSkill(fakeHome, ".cursor/skills/cursor-skill/SKILL.md", "description: Cursor skill");
    writeSkill(userDir, "skills/athena-skill/SKILL.md", "description: Athena skill");
  });

  it("includes all sources by default when enabledSources is omitted", () => {
    const skills = loadSkills({ cwd: projectDir, agentDir: userDir, homeDir: fakeHome });
    expect(skills.map((s) => s.name).sort()).toEqual(["athena-skill", "claude-skill", "codex-skill", "cursor-skill"]);
  });

  it("excludes claude skills when enabledSources.claude is false", () => {
    const skills = loadSkills({ cwd: projectDir, agentDir: userDir, homeDir: fakeHome, enabledSources: { claude: false } });
    expect(skills.some((s) => s.name === "claude-skill")).toBe(false);
    expect(skills.some((s) => s.name === "codex-skill")).toBe(true);
    expect(skills.some((s) => s.name === "cursor-skill")).toBe(true);
  });

  it("excludes codex and cursor skills when both toggled off, but keeps athena's own", () => {
    const skills = loadSkills({
      cwd: projectDir,
      agentDir: userDir,
      homeDir: fakeHome,
      enabledSources: { codex: false, cursor: false },
    });
    expect(skills.map((s) => s.name).sort()).toEqual(["athena-skill", "claude-skill"]);
  });

  it("athena's own source cannot be disabled via enabledSources (no such option)", () => {
    const skills = loadSkills({
      cwd: projectDir,
      agentDir: userDir,
      homeDir: fakeHome,
      enabledSources: { claude: false, codex: false, cursor: false },
    });
    expect(skills.map((s) => s.name)).toEqual(["athena-skill"]);
  });
});
