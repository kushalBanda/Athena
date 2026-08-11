import { existsSync, readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import ignore from "ignore";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { parseFrontmatter } from "./frontmatter.js";

const PROJECT_CONFIG_DIR = ".athena";
const MAX_NAME_LENGTH = 64;
const MAX_DESCRIPTION_LENGTH = 1024;
const IGNORE_FILE_NAMES = [".gitignore", ".ignore", ".fdignore"];

type IgnoreMatcher = ReturnType<typeof ignore>;

export type SkillSource = "athena" | "claude";
export type SkillScope = "user" | "project";

export interface Skill {
  name: string;
  description: string;
  filePath: string;
  disableModelInvocation: boolean;
  source: SkillSource;
  scope: SkillScope;
}

export interface SkillSourceToggles {
  claude?: boolean;
}

interface SkillFrontmatter {
  name?: string;
  description?: string;
  "disable-model-invocation"?: boolean;
  [key: string]: unknown;
}

function toPosixPath(p: string): string {
  return p.split(sep).join("/");
}

function prefixIgnorePattern(line: string, prefix: string): string | null {
  const trimmed = line.trim();
  if (!trimmed || (trimmed.startsWith("#") && !trimmed.startsWith("\\#"))) return null;

  let pattern = line;
  let negated = false;
  if (pattern.startsWith("!")) {
    negated = true;
    pattern = pattern.slice(1);
  } else if (pattern.startsWith("\\!")) {
    pattern = pattern.slice(1);
  }
  if (pattern.startsWith("/")) pattern = pattern.slice(1);

  const prefixed = prefix ? `${prefix}${pattern}` : pattern;
  return negated ? `!${prefixed}` : prefixed;
}

function addIgnoreRules(ig: IgnoreMatcher, dir: string, rootDir: string): void {
  const relativeDir = relative(rootDir, dir);
  const prefix = relativeDir ? `${toPosixPath(relativeDir)}/` : "";

  for (const filename of IGNORE_FILE_NAMES) {
    const ignorePath = join(dir, filename);
    if (!existsSync(ignorePath)) continue;
    try {
      const content = readFileSync(ignorePath, "utf-8");
      const patterns = content
        .split(/\r?\n/)
        .map((line) => prefixIgnorePattern(line, prefix))
        .filter((line): line is string => Boolean(line));
      if (patterns.length > 0) ig.add(patterns);
    } catch {
      // unreadable ignore file, skip it, not fatal
    }
  }
}

function loadSkillFromFile(filePath: string, source: SkillSource, scope: SkillScope): Skill | null {
  try {
    const rawContent = readFileSync(filePath, "utf-8");
    const { frontmatter } = parseFrontmatter<SkillFrontmatter>(rawContent);
    if (!frontmatter.description || frontmatter.description.trim() === "") return null;
    if (frontmatter.description.length > MAX_DESCRIPTION_LENGTH) return null;

    const skillDir = dirname(filePath);
    const name = frontmatter.name || basename(skillDir);
    if (name.length > MAX_NAME_LENGTH) return null;
    if (!/^[a-z0-9-]+$/.test(name)) return null;
    if (name.startsWith("-") || name.endsWith("-") || name.includes("--")) return null;

    return {
      name,
      description: frontmatter.description,
      filePath,
      disableModelInvocation: frontmatter["disable-model-invocation"] === true,
      source,
      scope,
    };
  } catch {
    return null;
  }
}

function loadSkillsFromDirInternal(
  dir: string,
  includeRootFiles: boolean,
  source: SkillSource,
  scope: SkillScope,
  ignoreMatcher?: IgnoreMatcher,
  rootDir?: string,
): Skill[] {
  if (!existsSync(dir)) return [];

  const root = rootDir ?? dir;
  const ig = ignoreMatcher ?? ignore();
  addIgnoreRules(ig, dir, root);

  const skills: Skill[] = [];
  try {
    const entries = readdirSync(dir, { withFileTypes: true });

    const skillMd = entries.find((e) => e.name === "SKILL.md" && e.isFile());
    if (skillMd) {
      const fullPath = join(dir, skillMd.name);
      const relPath = toPosixPath(relative(root, fullPath));
      if (!ig.ignores(relPath)) {
        const skill = loadSkillFromFile(fullPath, source, scope);
        if (skill) skills.push(skill);
      }
      return skills;
    }

    for (const entry of entries) {
      if (entry.name.startsWith(".") || entry.name === "node_modules") continue;

      const fullPath = join(dir, entry.name);
      const isDirectory = entry.isDirectory();
      const relPath = toPosixPath(relative(root, fullPath));
      const ignorePath = isDirectory ? `${relPath}/` : relPath;
      if (ig.ignores(ignorePath)) continue;

      if (isDirectory) {
        skills.push(...loadSkillsFromDirInternal(fullPath, false, source, scope, ig, root));
        continue;
      }

      if (includeRootFiles && entry.isFile() && entry.name.endsWith(".md")) {
        const skill = loadSkillFromFile(fullPath, source, scope);
        if (skill) skills.push(skill);
      }
    }
  } catch {}

  return skills;
}

export interface LoadSkillsOptions {
  cwd: string;
  agentDir: string;
  homeDir?: string;
  enabledSources?: SkillSourceToggles;
}

interface SourceDir {
  source: SkillSource;
  scope: SkillScope;
  dir: string;
}

export function loadSkills(options: LoadSkillsOptions): Skill[] {
  const home = options.homeDir ?? homedir();
  const projectRoot = resolve(options.cwd);
  const enabled = { claude: true, ...options.enabledSources };

  const sourceDirs: SourceDir[] = [
    ...(enabled.claude
      ? [
          {
            source: "claude" as const,
            scope: "user" as const,
            dir: join(home, ".claude", "skills"),
          },
        ]
      : []),
    { source: "athena", scope: "user", dir: join(resolve(options.agentDir), "skills") },
    ...(enabled.claude
      ? [
          {
            source: "claude" as const,
            scope: "project" as const,
            dir: join(projectRoot, ".claude", "skills"),
          },
        ]
      : []),
    { source: "athena", scope: "project", dir: join(projectRoot, PROJECT_CONFIG_DIR, "skills") },
  ];

  const byName = new Map<string, Skill>();
  for (const { source, scope, dir } of sourceDirs) {
    for (const skill of loadSkillsFromDirInternal(dir, true, source, scope)) {
      byName.set(skill.name, skill);
    }
  }
  return Array.from(byName.values());
}
