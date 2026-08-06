# Skill & Slash-Command Infrastructure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give Athena a filesystem-based skill system (SKILL.md discovery, project-scoped enablement gate, prompt injection) and a slash-command dispatcher in the CLI, shipping `/review` as the first working built-in skill.

**Architecture:** `packages/agent-core/src/skills/` owns discovery (fs scan → `Skill[]`) and enablement (`.athena/skills.json` → enabled name list). `context-loader.ts` wires enabled skills' `{name, description}` into the system prompt. `packages/cli/src/index.ts` loads the full discovered list once at startup and extends its existing `handleSlashCommand` to dispatch `/name` to a skill lookup, falling back to "unknown command" only if no skill matches either.

**Tech Stack:** TypeScript, Bun (`bun:test`), existing monorepo workspace layout (`@athena/agent-core`, `@athena/cli`).

## Global Constraints

- Test runner is `bun:test` (`import { describe, expect, it } from "bun:test"`) — see `packages/agent-core/test/system-prompt.test.ts` for house style.
- No new runtime dependencies — use `node:fs`, `node:path`, `node:os` only, matching `packages/cli/src/config.ts`.
- `name` in SKILL.md frontmatter does NOT need to match its parent folder name (deliberate, see spec).
- Discovery precedence: project (`cwd/.athena/skills`) overrides global (`~/.athena/skills`) overrides bundled built-ins. First-write-wins via `Map<name, Skill>`, symlinks deduped via a `Set<realPath>` (see spec, adapted from Pi's `loadSkills`).
- `/name` slash-command invocation is one-shot: it does not mutate `.athena/skills.json` or persist across turns.
- Spec: `docs/superpowers/specs/2026-08-06-skill-command-infra-design.md`

---

### Task 1: Skill types + discovery

**Files:**
- Create: `packages/agent-core/src/skills/types.ts`
- Create: `packages/agent-core/src/skills/discovery.ts`
- Test: `packages/agent-core/test/skills/discovery.test.ts`

**Interfaces:**
- Produces: `Skill { name: string; description: string; filePath: string; source: "project" | "global" | "bundled" }`
- Produces: `SkillDiagnostic { type: "collision" | "missing-description" | "parse-error"; message: string; path: string }`
- Produces: `discoverSkills(opts: { cwd: string; homeDir: string; bundledDir?: string }): { skills: Skill[]; diagnostics: SkillDiagnostic[] }`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/agent-core/test/skills/discovery.test.ts
import { describe, expect, it } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { discoverSkills } from "../../src/skills/discovery.js";

function makeSkill(dir: string, folderName: string, frontmatter: string, body = "body text") {
  const skillDir = join(dir, folderName);
  mkdirSync(skillDir, { recursive: true });
  writeFileSync(join(skillDir, "SKILL.md"), `---\n${frontmatter}\n---\n${body}\n`);
}

describe("discoverSkills", () => {
  it("finds a project skill", () => {
    const root = mkdtempSync(join(tmpdir(), "athena-skills-"));
    const projectDir = join(root, "project", ".athena", "skills");
    const homeDir = join(root, "home");
    makeSkill(projectDir, "review", "name: review\ndescription: Review code.");

    const { skills, diagnostics } = discoverSkills({ cwd: join(root, "project"), homeDir });

    expect(diagnostics).toEqual([]);
    expect(skills).toHaveLength(1);
    expect(skills[0]).toMatchObject({ name: "review", description: "Review code.", source: "project" });
    rmSync(root, { recursive: true, force: true });
  });

  it("project skill overrides global skill of the same name", () => {
    const root = mkdtempSync(join(tmpdir(), "athena-skills-"));
    const projectDir = join(root, "project", ".athena", "skills");
    const homeDir = join(root, "home", ".athena", "skills");
    makeSkill(projectDir, "review", "name: review\ndescription: Project version.");
    makeSkill(homeDir, "review", "name: review\ndescription: Global version.");

    const { skills, diagnostics } = discoverSkills({ cwd: join(root, "project"), homeDir: join(root, "home") });

    expect(skills).toHaveLength(1);
    expect(skills[0]?.description).toBe("Project version.");
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]?.type).toBe("collision");
    rmSync(root, { recursive: true, force: true });
  });

  it("skips a skill with no description and records a diagnostic", () => {
    const root = mkdtempSync(join(tmpdir(), "athena-skills-"));
    const projectDir = join(root, "project", ".athena", "skills");
    const homeDir = join(root, "home");
    makeSkill(projectDir, "broken", "name: broken");

    const { skills, diagnostics } = discoverSkills({ cwd: join(root, "project"), homeDir });

    expect(skills).toHaveLength(0);
    expect(diagnostics[0]?.type).toBe("missing-description");
    rmSync(root, { recursive: true, force: true });
  });

  it("frontmatter name does not need to match the folder name", () => {
    const root = mkdtempSync(join(tmpdir(), "athena-skills-"));
    const projectDir = join(root, "project", ".athena", "skills");
    const homeDir = join(root, "home");
    makeSkill(projectDir, "some-folder", "name: review\ndescription: Review code.");

    const { skills } = discoverSkills({ cwd: join(root, "project"), homeDir });

    expect(skills[0]?.name).toBe("review");
    rmSync(root, { recursive: true, force: true });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test packages/agent-core/test/skills/discovery.test.ts`
Expected: FAIL — `Cannot find module '../../src/skills/discovery.js'`

- [ ] **Step 3: Write `types.ts`**

```typescript
// packages/agent-core/src/skills/types.ts
export interface Skill {
  name: string;
  description: string;
  filePath: string;
  source: "project" | "global" | "bundled";
}

export interface SkillDiagnostic {
  type: "collision" | "missing-description" | "parse-error";
  message: string;
  path: string;
}
```

- [ ] **Step 4: Write `discovery.ts`**

```typescript
// packages/agent-core/src/skills/discovery.ts
import { existsSync, readFileSync, readdirSync, realpathSync, statSync } from "node:fs";
import { join } from "node:path";
import type { Skill, SkillDiagnostic } from "./types.js";

interface ParsedFrontmatter {
  name?: string;
  description?: string;
}

function parseFrontmatter(raw: string): ParsedFrontmatter {
  const match = raw.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return {};
  const result: ParsedFrontmatter = {};
  for (const line of (match[1] ?? "").split("\n")) {
    const kv = line.match(/^(\w+):\s*(.*)$/);
    if (!kv) continue;
    const key = kv[1];
    const value = (kv[2] ?? "").trim();
    if (key === "name") result.name = value;
    if (key === "description") result.description = value;
  }
  return result;
}

function scanDir(dir: string, source: Skill["source"]): { skills: Skill[]; diagnostics: SkillDiagnostic[] } {
  const skills: Skill[] = [];
  const diagnostics: SkillDiagnostic[] = [];
  if (!existsSync(dir)) return { skills, diagnostics };

  for (const entry of readdirSync(dir)) {
    const skillFile = join(dir, entry, "SKILL.md");
    if (!existsSync(skillFile) || !statSync(skillFile).isFile()) continue;

    const raw = readFileSync(skillFile, "utf8");
    const fm = parseFrontmatter(raw);

    if (!fm.name) {
      diagnostics.push({ type: "parse-error", message: `missing "name" in frontmatter`, path: skillFile });
      continue;
    }
    if (!fm.description) {
      diagnostics.push({ type: "missing-description", message: `skill "${fm.name}" has no description`, path: skillFile });
      continue;
    }

    skills.push({ name: fm.name, description: fm.description, filePath: skillFile, source });
  }

  return { skills, diagnostics };
}

export interface DiscoverSkillsOptions {
  cwd: string;
  homeDir: string;
  bundledDir?: string;
}

export interface DiscoverSkillsResult {
  skills: Skill[];
  diagnostics: SkillDiagnostic[];
}

/** project overrides global overrides bundled — first-write-wins into a name-keyed map. */
export function discoverSkills(opts: DiscoverSkillsOptions): DiscoverSkillsResult {
  const roots: Array<{ dir: string; source: Skill["source"] }> = [
    { dir: join(opts.cwd, ".athena", "skills"), source: "project" },
    { dir: join(opts.homeDir, ".athena", "skills"), source: "global" },
    ...(opts.bundledDir ? [{ dir: opts.bundledDir, source: "bundled" as const }] : []),
  ];

  const byName = new Map<string, Skill>();
  const seenRealPaths = new Set<string>();
  const diagnostics: SkillDiagnostic[] = [];

  for (const root of roots) {
    const { skills, diagnostics: scanDiagnostics } = scanDir(root.dir, root.source);
    diagnostics.push(...scanDiagnostics);

    for (const skill of skills) {
      const realPath = existsSync(skill.filePath) ? realpathSync(skill.filePath) : skill.filePath;
      if (seenRealPaths.has(realPath)) continue; // same physical file via symlink, not a real collision

      const existing = byName.get(skill.name);
      if (existing) {
        diagnostics.push({
          type: "collision",
          message: `skill name "${skill.name}" already loaded from ${existing.filePath}; ignoring ${skill.filePath}`,
          path: skill.filePath,
        });
        continue;
      }

      byName.set(skill.name, skill);
      seenRealPaths.add(realPath);
    }
  }

  return { skills: Array.from(byName.values()), diagnostics };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `bun test packages/agent-core/test/skills/discovery.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 6: Commit**

```bash
git add packages/agent-core/src/skills/types.ts packages/agent-core/src/skills/discovery.ts packages/agent-core/test/skills/discovery.test.ts
git commit -m "Add skill discovery (SKILL.md scan, project/global/bundled precedence)"
```

---

### Task 2: Enablement gate

**Files:**
- Create: `packages/agent-core/src/skills/enablement.ts`
- Test: `packages/agent-core/test/skills/enablement.test.ts`

**Interfaces:**
- Consumes: nothing from Task 1 directly (reads its own JSON file)
- Produces: `DEFAULT_ENABLED_SKILLS: string[]` (= `["review"]`)
- Produces: `loadEnabledSkillNames(cwd: string): string[]`
- Produces: `filterEnabledSkills(skills: Skill[], enabledNames: string[]): Skill[]` (consumes `Skill` from Task 1's `types.ts`)

- [ ] **Step 1: Write the failing test**

```typescript
// packages/agent-core/test/skills/enablement.test.ts
import { describe, expect, it } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { DEFAULT_ENABLED_SKILLS, loadEnabledSkillNames, filterEnabledSkills } from "../../src/skills/enablement.js";
import type { Skill } from "../../src/skills/types.js";

describe("loadEnabledSkillNames", () => {
  it("returns defaults when .athena/skills.json is missing", () => {
    const root = mkdtempSync(join(tmpdir(), "athena-enable-"));
    expect(loadEnabledSkillNames(root)).toEqual(DEFAULT_ENABLED_SKILLS);
    rmSync(root, { recursive: true, force: true });
  });

  it("reads enabled list from .athena/skills.json", () => {
    const root = mkdtempSync(join(tmpdir(), "athena-enable-"));
    mkdirSync(join(root, ".athena"), { recursive: true });
    writeFileSync(join(root, ".athena", "skills.json"), JSON.stringify({ enabled: ["review", "typescript-pro"] }));
    expect(loadEnabledSkillNames(root)).toEqual(["review", "typescript-pro"]);
    rmSync(root, { recursive: true, force: true });
  });

  it("falls back to defaults on malformed JSON", () => {
    const root = mkdtempSync(join(tmpdir(), "athena-enable-"));
    mkdirSync(join(root, ".athena"), { recursive: true });
    writeFileSync(join(root, ".athena", "skills.json"), "{not valid json");
    expect(loadEnabledSkillNames(root)).toEqual(DEFAULT_ENABLED_SKILLS);
    rmSync(root, { recursive: true, force: true });
  });
});

describe("filterEnabledSkills", () => {
  it("keeps only skills whose name is in the enabled list", () => {
    const skills: Skill[] = [
      { name: "review", description: "d1", filePath: "/a", source: "bundled" },
      { name: "typescript-pro", description: "d2", filePath: "/b", source: "global" },
    ];
    expect(filterEnabledSkills(skills, ["review"])).toEqual([skills[0]]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test packages/agent-core/test/skills/enablement.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write `enablement.ts`**

```typescript
// packages/agent-core/src/skills/enablement.ts
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Skill } from "./types.js";

export const DEFAULT_ENABLED_SKILLS: string[] = ["review"];

interface SkillsJson {
  enabled?: string[];
}

export function loadEnabledSkillNames(cwd: string): string[] {
  const filePath = join(cwd, ".athena", "skills.json");
  if (!existsSync(filePath)) return DEFAULT_ENABLED_SKILLS;

  try {
    const parsed = JSON.parse(readFileSync(filePath, "utf8")) as SkillsJson;
    if (!Array.isArray(parsed.enabled)) return DEFAULT_ENABLED_SKILLS;
    return parsed.enabled;
  } catch {
    return DEFAULT_ENABLED_SKILLS;
  }
}

export function filterEnabledSkills(skills: Skill[], enabledNames: string[]): Skill[] {
  const enabledSet = new Set(enabledNames);
  return skills.filter((skill) => enabledSet.has(skill.name));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test packages/agent-core/test/skills/enablement.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add packages/agent-core/src/skills/enablement.ts packages/agent-core/test/skills/enablement.test.ts
git commit -m "Add skill enablement gate (.athena/skills.json, default-enabled list)"
```

---

### Task 3: Bundled `review` skill content

**Files:**
- Create: `packages/agent-core/skills/review/SKILL.md`

**Interfaces:**
- Consumes: nothing (static content)
- Produces: a discoverable bundled skill at `packages/agent-core/skills/review/SKILL.md`, picked up by Task 1's `discoverSkills` when called with `bundledDir` pointing here (wired in Task 4)

- [ ] **Step 1: Write the skill file**

```markdown
---
name: review
description: Terse, severity-tagged code review comments — one line per finding (location, problem, fix). Use when reviewing a PR, diff, or the user says "review this", "code review", "/review".
---

Write code review comments terse and actionable. One line per finding. Location, problem, fix. No throat-clearing.

## Rules

**Format:** `L<line>: <problem>. <fix>.` — or `<file>:L<line>: ...` when reviewing multi-file diffs.

**Severity prefix (when findings are mixed):**
- `bug:` — broken behavior, will cause an incident
- `risk:` — works but fragile (race, missing null check, swallowed error)
- `nit:` — style, naming, micro-optimization; author can ignore
- `q:` — genuine question, not a suggestion

**Drop:** "I noticed that...", "It seems like...", hedging ("perhaps", "maybe"), restating what the line already does, praise sprinkled per-comment (say it once at the top if warranted).

**Keep:** exact line numbers, exact symbol names in backticks, a concrete fix (not "consider refactoring this"), the *why* only if the fix isn't obvious from the problem statement.

## Examples

Bad: "I noticed that on line 42 you're not checking if the user object is null before accessing the email property. This could potentially cause a crash."
Good: `L42: bug: user can be null after .find(). Add guard before .email.`

Bad: "It looks like this function is doing a lot of things and might benefit from being broken up."
Good: `L88-140: nit: 50-line fn does 4 things. Extract validate/normalize/persist.`

## Auto-Clarity

Drop terse mode for: security findings (explain fully + reference), architectural disagreements (need rationale), and onboarding contexts where the author needs the "why". Write a normal paragraph there, then resume terse for the rest.

## Boundaries

Reviews only — does not write the fix, does not approve/request-changes, does not run linters. Output findings ready to paste into the PR.
```

- [ ] **Step 2: Commit**

```bash
git add packages/agent-core/skills/review/SKILL.md
git commit -m "Add bundled review skill content"
```

---

### Task 4: System prompt skills block

**Files:**
- Modify: `packages/agent-core/src/system-prompt.ts`
- Modify: `packages/agent-core/test/system-prompt.test.ts`

**Interfaces:**
- Consumes: `Skill` from `./skills/types.js` (Task 1) — only `name` and `description` fields
- Produces: `buildSkillsBlock(skills: Pick<Skill, "name" | "description">[]): string`
- Produces: `buildAthenaSystemPrompt` gains an optional `skills?: Pick<Skill, "name" | "description">[]` field on its options object

- [ ] **Step 1: Write the failing test**

```typescript
// append to packages/agent-core/test/system-prompt.test.ts
import { buildSkillsBlock } from "../src/system-prompt.js"; // add to existing import line instead

describe("buildSkillsBlock", () => {
  it("formats enabled skills as a bullet list", () => {
    const block = buildSkillsBlock([{ name: "review", description: "Review code." }]);
    expect(block).toContain("# Skills");
    expect(block).toContain("- review: Review code.");
  });

  it("returns empty string for no skills", () => {
    expect(buildSkillsBlock([])).toBe("");
  });
});

describe("buildAthenaSystemPrompt skills block", () => {
  it("includes skills block when skills provided", () => {
    const prompt = buildAthenaSystemPrompt({
      env: baseEnv,
      toolNames: [],
      skills: [{ name: "review", description: "Review code." }],
    });
    expect(prompt).toContain("# Skills");
    expect(prompt).toContain("- review: Review code.");
    expect(prompt).toContain("read_file");
  });

  it("omits skills block when no skills provided", () => {
    const prompt = buildAthenaSystemPrompt({ env: baseEnv, toolNames: [] });
    expect(prompt).not.toContain("# Skills");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test packages/agent-core/test/system-prompt.test.ts`
Expected: FAIL — `buildSkillsBlock` not exported, `skills` not a valid option

- [ ] **Step 3: Implement in `system-prompt.ts`**

Add near `buildToolsList`:

```typescript
export function buildSkillsBlock(skills: Array<{ name: string; description: string }>): string {
  if (skills.length === 0) return "";
  const lines = skills.map((s) => `- ${s.name}: ${s.description}`).join("\n");
  return `\n# Skills\nWhen a task matches a skill's description, use the read_file tool to load its full SKILL.md and follow its instructions.\n${lines}`;
}
```

Update `buildAthenaSystemPrompt`'s options type and body (in the same file):

```typescript
export function buildAthenaSystemPrompt(options: {
  env: SystemPromptEnv;
  toolNames: string[];
  customPrompt?: string;
  codeContext?: string;
  skills?: Array<{ name: string; description: string }>;
}): string {
  const { env, toolNames, customPrompt, codeContext, skills = [] } = options;

  const envBlock = buildEnvBlock(env);
  const toolsBlock =
    toolNames.length > 0
      ? `\n# Available tools\n${buildToolsList(toolNames)}`
      : "";
  const skillsBlock = buildSkillsBlock(skills);

  const codeCtxBlock = codeContext
    ? `\n\n<code-context>\n${codeContext}\n</code-context>`
    : "";

  const customBlock = customPrompt ? `\n\n${customPrompt}` : "";

  return (
    ATHENA_SYSTEM_PROMPT_BASE +
    toolsBlock +
    skillsBlock +
    codeCtxBlock +
    customBlock
  );
}
```

(Keep the existing `envBlock` usage as-is if the current implementation already interpolates it elsewhere in the function — only add `skillsBlock` into the concatenation, don't restructure what's already there.)

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test packages/agent-core/test/system-prompt.test.ts`
Expected: PASS (all prior + 4 new tests)

- [ ] **Step 5: Commit**

```bash
git add packages/agent-core/src/system-prompt.ts packages/agent-core/test/system-prompt.test.ts
git commit -m "Inject enabled-skills block into system prompt"
```

---

### Task 5: Wire discovery + enablement into `context-loader.ts`

**Files:**
- Modify: `packages/agent-core/src/context-loader.ts`
- Create: `packages/agent-core/test/context-loader-skills.test.ts`
- Modify: `packages/agent-core/src/index.ts` (re-export skill functions for CLI use)

**Interfaces:**
- Consumes: `discoverSkills` (Task 1), `loadEnabledSkillNames` + `filterEnabledSkills` (Task 2), `buildAthenaSystemPrompt` with `skills` option (Task 4)
- Produces: `buildSystemPrompt` (existing exported function) now includes the skills block automatically — no signature change, since `cwd` is already a parameter
- Produces (re-export from `packages/agent-core/src/index.ts`): `discoverSkills`, `loadEnabledSkillNames`, `filterEnabledSkills`, `Skill`, `SkillDiagnostic` — needed by Task 6/7 in `packages/cli`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/agent-core/test/context-loader-skills.test.ts
import { describe, expect, it } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { buildSystemPrompt } from "../src/context-loader.js";

describe("buildSystemPrompt skills wiring", () => {
  it("includes an enabled project skill in the prompt", async () => {
    const root = mkdtempSync(join(tmpdir(), "athena-ctx-"));
    const skillsDir = join(root, ".athena", "skills", "greet");
    mkdirSync(skillsDir, { recursive: true });
    writeFileSync(join(skillsDir, "SKILL.md"), "---\nname: greet\ndescription: Say hello.\n---\nSay hello.");
    writeFileSync(join(root, ".athena", "skills.json"), JSON.stringify({ enabled: ["greet"] }));

    const prompt = await buildSystemPrompt(root, "hi", []);

    expect(prompt).toContain("- greet: Say hello.");
    rmSync(root, { recursive: true, force: true });
  });

  it("omits a discovered-but-not-enabled skill", async () => {
    const root = mkdtempSync(join(tmpdir(), "athena-ctx-"));
    const skillsDir = join(root, ".athena", "skills", "greet");
    mkdirSync(skillsDir, { recursive: true });
    writeFileSync(join(skillsDir, "SKILL.md"), "---\nname: greet\ndescription: Say hello.\n---\nSay hello.");
    // no skills.json -> only DEFAULT_ENABLED_SKILLS ("review") is enabled

    const prompt = await buildSystemPrompt(root, "hi", []);

    expect(prompt).not.toContain("greet: Say hello.");
    rmSync(root, { recursive: true, force: true });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test packages/agent-core/test/context-loader-skills.test.ts`
Expected: FAIL — prompt has no skills block yet

- [ ] **Step 3: Wire it up in `context-loader.ts`**

Add imports and call the discovery/enablement pipeline before the final `buildAthenaSystemPrompt` call:

```typescript
import { homedir } from "node:os";
import { discoverSkills } from "./skills/discovery.js";
import { loadEnabledSkillNames, filterEnabledSkills } from "./skills/enablement.js";
```

Inside `buildSystemPrompt`, before the `return buildAthenaSystemPrompt({...})`:

```typescript
  const bundledSkillsDir = new URL("../skills", import.meta.url).pathname;
  const { skills: discovered } = discoverSkills({ cwd, homeDir: homedir(), bundledDir: bundledSkillsDir });
  const enabledNames = loadEnabledSkillNames(cwd);
  const enabledSkills = filterEnabledSkills(discovered, enabledNames);
```

And add `skills: enabledSkills,` to the object passed into `buildAthenaSystemPrompt`.

- [ ] **Step 4: Re-export from `packages/agent-core/src/index.ts`**

```typescript
export { discoverSkills } from "./skills/discovery.js";
export { loadEnabledSkillNames, filterEnabledSkills, DEFAULT_ENABLED_SKILLS } from "./skills/enablement.js";
export type { Skill, SkillDiagnostic } from "./skills/types.js";
```

- [ ] **Step 5: Run test to verify it passes**

Run: `bun test packages/agent-core/test/context-loader-skills.test.ts`
Expected: PASS (2 tests). Also re-run `bun test packages/agent-core` to confirm no regressions.

- [ ] **Step 6: Commit**

```bash
git add packages/agent-core/src/context-loader.ts packages/agent-core/src/index.ts packages/agent-core/test/context-loader-skills.test.ts
git commit -m "Wire skill discovery + enablement into system prompt building"
```

---

### Task 6: CLI slash-command dispatch for skills

**Files:**
- Create: `packages/cli/src/skill-commands.ts`
- Create: `packages/cli/test/skill-commands.test.ts`
- Modify: `packages/cli/src/index.ts`

**Interfaces:**
- Consumes: `Skill` type and `discoverSkills` from `@athena/agent-core` (Task 5's re-exports)
- Produces: `buildSkillTurn(skill: Skill, args: string): string` — reads the skill's SKILL.md body (content after the frontmatter) and appends `\nUser: <args>` (omit the `User:` line entirely when `args` is empty)
- Produces: `findSkillCommand(skills: Skill[], cmd: string): Skill | undefined`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/cli/test/skill-commands.test.ts
import { describe, expect, it } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { buildSkillTurn, findSkillCommand } from "../src/skill-commands.js";
import type { Skill } from "@athena/agent-core";

function writeSkillFile(dir: string, body: string): string {
  mkdirSync(dir, { recursive: true });
  const filePath = join(dir, "SKILL.md");
  writeFileSync(filePath, `---\nname: review\ndescription: d\n---\n${body}`);
  return filePath;
}

describe("findSkillCommand", () => {
  it("finds a skill by name, case-insensitively", () => {
    const skills: Skill[] = [{ name: "review", description: "d", filePath: "/x", source: "bundled" }];
    expect(findSkillCommand(skills, "REVIEW")?.name).toBe("review");
  });

  it("returns undefined for unknown command", () => {
    const skills: Skill[] = [{ name: "review", description: "d", filePath: "/x", source: "bundled" }];
    expect(findSkillCommand(skills, "nope")).toBeUndefined();
  });
});

describe("buildSkillTurn", () => {
  it("appends args as a User line", () => {
    const root = mkdtempSync(join(tmpdir(), "athena-cli-skill-"));
    const filePath = writeSkillFile(root, "Do the thing.");
    const skill: Skill = { name: "review", description: "d", filePath, source: "bundled" };

    const turn = buildSkillTurn(skill, "src/foo.ts");

    expect(turn).toBe("Do the thing.\nUser: src/foo.ts");
    rmSync(root, { recursive: true, force: true });
  });

  it("omits the User line when args are empty", () => {
    const root = mkdtempSync(join(tmpdir(), "athena-cli-skill-"));
    const filePath = writeSkillFile(root, "Do the thing.");
    const skill: Skill = { name: "review", description: "d", filePath, source: "bundled" };

    const turn = buildSkillTurn(skill, "");

    expect(turn).toBe("Do the thing.");
    rmSync(root, { recursive: true, force: true });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test packages/cli/test/skill-commands.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write `skill-commands.ts`**

```typescript
// packages/cli/src/skill-commands.ts
import { readFileSync } from "node:fs";
import type { Skill } from "@athena/agent-core";

export function findSkillCommand(skills: Skill[], cmd: string): Skill | undefined {
  const target = cmd.toLowerCase();
  return skills.find((s) => s.name.toLowerCase() === target);
}

function stripFrontmatter(raw: string): string {
  return raw.replace(/^---\n[\s\S]*?\n---\n?/, "").trim();
}

export function buildSkillTurn(skill: Skill, args: string): string {
  const raw = readFileSync(skill.filePath, "utf8");
  const body = stripFrontmatter(raw);
  const trimmedArgs = args.trim();
  return trimmedArgs ? `${body}\nUser: ${trimmedArgs}` : body;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test packages/cli/test/skill-commands.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Wire into `packages/cli/src/index.ts`**

Add the import near the other local imports:

```typescript
import { discoverSkills } from "@athena/agent-core";
import type { Skill } from "@athena/agent-core";
import { findSkillCommand, buildSkillTurn } from "./skill-commands.js";
import { homedir } from "node:os";
```

After `const cwd = process.cwd();` (around line 170), discover the full skill list once:

```typescript
  const bundledSkillsDir = new URL("../../agent-core/skills", import.meta.url).pathname;
  const { skills: discoveredSkills } = discoverSkills({ cwd, homeDir: homedir(), bundledDir: bundledSkillsDir });
```

Refactor the tail of `handleUserMessage` (the part after the slash-command check) into a standalone function so both a plain message and a resolved `/name` skill turn can reach it:

```typescript
  const runTurn = async (msg: string, tui: TuiCallbacks): Promise<void> => {
    const adapterState: AdapterState = {
      currentToolCallId: null,
      streamingMessageId: null,
      streamingContent: "",
    };
    const requestPermission = async (toolName: string, input: unknown): Promise<boolean> => {
      const summary = JSON.stringify(input).slice(0, 200);
      const choice = await tui.pickFromList(`Allow ${toolName}? ${summary}`, ["Allow", "Deny"]);
      return choice === "Allow";
    };
    const callbacks = createCallbacks(tui, adapterState, requestPermission);

    const agentSession = await runAgent(msg, { provider: session.provider, tools, cwd, callbacks });

    finalizeStream(tui, adapterState);
    tui.addTokens(agentSession.tokenUsage.input, agentSession.tokenUsage.output);
    if (agentSession.tokenUsage.costUsd !== undefined) {
      tui.addCost(agentSession.tokenUsage.costUsd);
    }
  };

  const handleUserMessage = async (msg: string, tui: TuiCallbacks): Promise<void> => {
    if (msg.startsWith("/")) {
      handleSlashCommand(msg, tui);
      return;
    }
    await runTurn(msg, tui);
  };
```

In `handleSlashCommand`, replace the final fallback:

```typescript
    sysMsg(tui, `unknown command: /${cmd}. Type /help for a list.`);
    return true;
```

with a skill lookup before giving up (skill dispatch is async, so it uses the same `void (async () => {...})()` pattern already used for `/model` and `/provider` in this function):

```typescript
    const skill = cmd ? findSkillCommand(discoveredSkills, cmd) : undefined;
    if (skill) {
      const args = parts.slice(1).join(" ");
      void (async () => {
        const turn = buildSkillTurn(skill, args);
        await runTurn(turn, tui);
      })();
      return true;
    }

    sysMsg(tui, `unknown command: /${cmd}. Type /help for a list.`);
    return true;
```

- [ ] **Step 6: Manual verification**

Run: `bun run --cwd packages/cli src/index.ts`, type `/review` with no other project changes.
Expected: agent responds using the review skill's tone (terse, `L<line>:` format) rather than "unknown command".

- [ ] **Step 7: Commit**

```bash
git add packages/cli/src/skill-commands.ts packages/cli/test/skill-commands.test.ts packages/cli/src/index.ts
git commit -m "Dispatch /name slash commands to discovered skills"
```

---

### Task 7: `/help` lists discovered skill commands

**Files:**
- Modify: `packages/cli/src/index.ts`
- Modify: `packages/cli/test/adapter.test.ts` or create `packages/cli/test/slash-help.test.ts` (check which file already covers `handleSlashCommand`-adjacent behavior before creating a new one)

**Interfaces:**
- Consumes: `discoveredSkills` from Task 6 (already in scope inside `main()`)
- Produces: no new exports — `/help` output gains one line per discovered skill

- [ ] **Step 1: Extend the `/help` text in `handleSlashCommand`**

```typescript
    if (cmd === "help") {
      const skillLines = discoveredSkills.map((s) => `/${s.name.padEnd(24)}${s.description}`);
      sysMsg(tui, [
        "/model [id]              switch model (opens picker if no id given)",
        "/provider [name]         switch provider (opens picker if no name given)",
        "/key <provider> <key>    store API key in auth.json",
        "/status                  show current provider + model",
        "/clear                   clear chat history",
        "/exit  /quit             quit athena",
        ...(skillLines.length > 0 ? ["", "Skills:", ...skillLines] : []),
      ].join("\n"));
      return true;
    }
```

- [ ] **Step 2: Manual verification**

Run: `bun run --cwd packages/cli src/index.ts`, type `/help`.
Expected: output includes `/review` with its description under a "Skills:" heading.

- [ ] **Step 3: Commit**

```bash
git add packages/cli/src/index.ts
git commit -m "List discovered skills in /help output"
```

---

## Self-Review Notes

- **Spec coverage:** SKILL.md format (Task 1/3), discovery + collision precedence (Task 1), enablement gate (Task 2), prompt injection (Task 4/5), slash commands incl. one-shot bypass scope (Task 6), `/help` discoverability (Task 7, a reasonable spec-implied addition since `/review` must be discoverable by a user who doesn't already know it exists). Out-of-scope items from the spec (prompt tone rewrite, category skill library, remote URLs, extra frontmatter fields) are correctly untouched.
- **Type consistency:** `Skill { name, description, filePath, source }` defined once in Task 1 and reused verbatim through Tasks 4-6 without renaming fields.
- **No placeholders:** every step has runnable code; no "add error handling" style steps remain.
