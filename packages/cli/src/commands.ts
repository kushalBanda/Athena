import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { parseFrontmatter } from "@athena/agent-core";

const PROJECT_CONFIG_DIR = ".athena";

export interface CommandTemplate {
  name: string;
  description: string;
  argumentHint?: string;
  content: string;
}

export function parseCommandArgs(argsString: string): string[] {
  const args: string[] = [];
  let current = "";
  let inQuote: string | null = null;

  for (let i = 0; i < argsString.length; i++) {
    const char = argsString[i]!;
    if (inQuote) {
      if (char === inQuote) inQuote = null;
      else current += char;
    } else if (char === '"' || char === "'") {
      inQuote = char;
    } else if (/\s/.test(char)) {
      if (current) {
        args.push(current);
        current = "";
      }
    } else {
      current += char;
    }
  }
  if (current) args.push(current);
  return args;
}

export function substituteArgs(content: string, args: string[]): string {
  const allArgs = args.join(" ");
  return content.replace(
    /\$\{(\d+|ARGUMENTS|@):-([^}]*)\}|\$\{@:(\d+)(?::(\d+))?\}|\$(ARGUMENTS|@|\d+)/g,
    (_match, defaultTarget, defaultValue, sliceStart, sliceLength, simple) => {
      if (defaultTarget) {
        const value =
          defaultTarget === "@" || defaultTarget === "ARGUMENTS" ? allArgs : args[parseInt(defaultTarget, 10) - 1];
        return value ? value : defaultValue;
      }
      if (sliceStart) {
        let start = parseInt(sliceStart, 10) - 1;
        if (start < 0) start = 0;
        if (sliceLength) return args.slice(start, start + parseInt(sliceLength, 10)).join(" ");
        return args.slice(start).join(" ");
      }
      if (simple === "ARGUMENTS" || simple === "@") return allArgs;
      const index = parseInt(simple, 10) - 1;
      return args[index] ?? "";
    },
  );
}

function loadTemplateFromFile(filePath: string): CommandTemplate | null {
  try {
    const rawContent = readFileSync(filePath, "utf-8");
    const { frontmatter, body } = parseFrontmatter<Record<string, string>>(rawContent);
    const name = basename(filePath).replace(/\.md$/, "");

    let description = frontmatter.description || "";
    if (!description) {
      const firstLine = body.split("\n").find((line) => line.trim());
      if (firstLine) {
        description = firstLine.slice(0, 60);
        if (firstLine.length > 60) description += "...";
      }
    }

    return {
      name,
      description,
      ...(frontmatter["argument-hint"] ? { argumentHint: frontmatter["argument-hint"] } : {}),
      content: body,
    };
  } catch {
    return null;
  }
}

function loadTemplatesFromDir(dir: string): CommandTemplate[] {
  const templates: CommandTemplate[] = [];
  if (!existsSync(dir)) return templates;

  try {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isFile() && entry.name.endsWith(".md")) {
        const template = loadTemplateFromFile(fullPath);
        if (template) templates.push(template);
      }
    }
  } catch {
  }
  return templates;
}

export interface LoadCommandTemplatesOptions {
  cwd: string;
  agentDir: string;
}

export function loadCommandTemplates(options: LoadCommandTemplatesOptions): CommandTemplate[] {
  const userTemplates = loadTemplatesFromDir(join(resolve(options.agentDir), "commands"));
  const projectTemplates = loadTemplatesFromDir(
    join(resolve(options.cwd), PROJECT_CONFIG_DIR, "commands"),
  );

  const byName = new Map<string, CommandTemplate>();
  for (const t of userTemplates) byName.set(t.name, t);
  for (const t of projectTemplates) byName.set(t.name, t);
  return Array.from(byName.values());
}

export function expandPromptTemplate(text: string, templates: CommandTemplate[]): string {
  if (!text.startsWith("/")) return text;

  const match = text.match(/^\/([^\s]+)(?:\s+([\s\S]*))?$/);
  if (!match) return text;

  const templateName = match[1];
  const argsString = match[2] ?? "";

  const template = templates.find((t) => t.name === templateName);
  if (template) {
    const args = parseCommandArgs(argsString);
    return substituteArgs(template.content, args);
  }
  return text;
}
