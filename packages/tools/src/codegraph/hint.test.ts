import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { GrepTool } from "../impl/grep.js";
import type { Tool, ToolContext, ToolResult } from "../types.js";
import { withCodegraphHint } from "./hint.js";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "athena-hint-test-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function makeStubTool(): Tool {
  return {
    name: "grep",
    description: "stub",
    inputSchema: {},
    permission: "auto",
    async execute(_input: unknown, _ctx: ToolContext): Promise<ToolResult> {
      return { content: "match found in file.ts:10", isError: false };
    },
    toToolDef() {
      return { name: "grep", description: "stub", inputSchema: {} };
    },
  };
}

describe("withCodegraphHint", () => {
  test("passes through output unchanged when no index exists", async () => {
    const wrapped = withCodegraphHint(makeStubTool());
    const result = await wrapped.execute({ pattern: "foo" }, { workingDir: dir });
    expect(result.content).toBe("match found in file.ts:10");
  });

  test("appends a codegraph_query hint when an index exists", async () => {
    mkdirSync(path.join(dir, ".codegraph"));
    writeFileSync(path.join(dir, ".codegraph", "codegraph.db"), "");
    const wrapped = withCodegraphHint(makeStubTool());
    const result = await wrapped.execute({ pattern: "foo" }, { workingDir: dir });
    expect(result.content).toContain("match found in file.ts:10");
    expect(result.content).toContain("codegraph_query");
  });

  test("preserves isError and metadata from the wrapped tool", async () => {
    mkdirSync(path.join(dir, ".codegraph"));
    writeFileSync(path.join(dir, ".codegraph", "codegraph.db"), "");
    const errorTool: Tool = {
      ...makeStubTool(),
      async execute(): Promise<ToolResult> {
        return { content: "no matches", isError: true, metadata: { count: 0 } };
      },
    };
    const wrapped = withCodegraphHint(errorTool);
    const result = await wrapped.execute({ pattern: "foo" }, { workingDir: dir });
    expect(result.isError).toBe(true);
    expect(result.metadata).toEqual({ count: 0 });
  });

  test("preserves toToolDef() on a real class-instance tool (BaseTool subclasses use prototype methods)", () => {
    const wrapped = withCodegraphHint(new GrepTool());
    expect(typeof wrapped.toToolDef).toBe("function");
    const def = wrapped.toToolDef();
    expect(def.name).toBe("grep");
  });
});
