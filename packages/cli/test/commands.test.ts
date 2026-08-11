import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  loadCommandTemplates,
  parseCommandArgs,
  substituteArgs,
  expandPromptTemplate,
} from "../src/commands.js";

const tmpRoot = "/tmp/athena-commands-test";
const userDir = join(tmpRoot, "user-agent-dir");
const projectDir = join(tmpRoot, "project-cwd");

beforeEach(() => {
  mkdirSync(join(userDir, "commands"), { recursive: true });
  mkdirSync(join(projectDir, ".athena", "commands"), { recursive: true });
});

afterEach(() => rmSync(tmpRoot, { recursive: true, force: true }));

describe("parseCommandArgs", () => {
  it("splits on whitespace", () => {
    expect(parseCommandArgs("foo bar baz")).toEqual(["foo", "bar", "baz"]);
  });
  it("respects double and single quotes", () => {
    expect(parseCommandArgs(`"foo bar" 'baz qux'`)).toEqual(["foo bar", "baz qux"]);
  });
});

describe("substituteArgs", () => {
  it("substitutes $1, $2 positionally", () => {
    expect(substituteArgs("Fix $1 in $2", ["bug", "file.ts"])).toBe("Fix bug in file.ts");
  });
  it("substitutes $ARGUMENTS and $@ with all args joined", () => {
    expect(substituteArgs("Do: $ARGUMENTS", ["a", "b"])).toBe("Do: a b");
    expect(substituteArgs("Do: $@", ["a", "b"])).toBe("Do: a b");
  });
  it("applies ${N:-default} when arg missing", () => {
    expect(substituteArgs("Level: ${1:-medium}", [])).toBe("Level: medium");
    expect(substituteArgs("Level: ${1:-medium}", ["high"])).toBe("Level: high");
  });
  it("slices with ${@:N} and ${@:N:L}", () => {
    expect(substituteArgs("${@:2}", ["a", "b", "c"])).toBe("b c");
    expect(substituteArgs("${@:2:1}", ["a", "b", "c"])).toBe("b");
  });
});

describe("loadCommandTemplates", () => {
  it("loads a command from the user commands dir with frontmatter description", () => {
    writeFileSync(
      join(userDir, "commands", "review.md"),
      "---\ndescription: Review the diff\n---\nReview: $ARGUMENTS",
    );
    const templates = loadCommandTemplates({ cwd: projectDir, agentDir: userDir });
    const t = templates.find((c) => c.name === "review");
    expect(t?.description).toBe("Review the diff");
    expect(t?.content).toBe("Review: $ARGUMENTS");
  });

  it("falls back to first non-empty line for description when frontmatter omits it", () => {
    writeFileSync(join(userDir, "commands", "quick.md"), "Do the quick thing.\nMore text.");
    const templates = loadCommandTemplates({ cwd: projectDir, agentDir: userDir });
    expect(templates.find((c) => c.name === "quick")?.description).toBe("Do the quick thing.");
  });

  it("does not recurse into subdirectories", () => {
    mkdirSync(join(userDir, "commands", "nested"), { recursive: true });
    writeFileSync(join(userDir, "commands", "nested", "deep.md"), "Deep command.");
    const templates = loadCommandTemplates({ cwd: projectDir, agentDir: userDir });
    expect(templates.some((c) => c.name === "deep")).toBe(false);
  });

  it("project command wins over user command on name collision", () => {
    writeFileSync(join(userDir, "commands", "shared.md"), "User version");
    writeFileSync(join(projectDir, ".athena", "commands", "shared.md"), "Project version");
    const templates = loadCommandTemplates({ cwd: projectDir, agentDir: userDir });
    const shared = templates.filter((c) => c.name === "shared");
    expect(shared).toHaveLength(1);
    expect(shared[0]?.content).toBe("Project version");
  });
});

describe("expandPromptTemplate", () => {
  it("expands a matching /command with substituted args", () => {
    const templates = [
      { name: "review", description: "d", content: "Review: $ARGUMENTS" },
    ];
    expect(expandPromptTemplate("/review the diff", templates)).toBe("Review: the diff");
  });

  it("returns the original text when no template matches", () => {
    const templates = [{ name: "review", description: "d", content: "x" }];
    expect(expandPromptTemplate("/unknown foo", templates)).toBe("/unknown foo");
  });

  it("returns the original text for non-slash input", () => {
    expect(expandPromptTemplate("plain text", [])).toBe("plain text");
  });
});
