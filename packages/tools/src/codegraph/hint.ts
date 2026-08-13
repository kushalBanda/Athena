import { existsSync } from "node:fs";
import type { Tool, ToolContext, ToolResult } from "../types.js";
import { getIndexDbPath } from "./paths.js";

function hasCodegraphIndex(workingDir: string): boolean {
  return existsSync(getIndexDbPath(workingDir));
}

function inferQuery(input: unknown): string {
  if (typeof input === "object" && input !== null) {
    const obj = input as Record<string, unknown>;
    if (typeof obj.pattern === "string") return obj.pattern;
    if (typeof obj.path === "string") return obj.path;
  }
  return "this area of the codebase";
}

// No object-spread here — execute/toToolDef are prototype methods on BaseTool subclasses, spread drops them.
export function withCodegraphHint(tool: Tool): Tool {
  return {
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema,
    permission: tool.permission,
    async execute(input: unknown, ctx: ToolContext): Promise<ToolResult> {
      const result = await tool.execute(input, ctx);
      if (!hasCodegraphIndex(ctx.workingDir)) return result;

      const query = inferQuery(input);
      const hint = `\n\ncodegraph_query may answer broader questions here in 1 call — try: codegraph_query("${query}")`;
      return {
        ...result,
        content: `${result.content}${hint}`,
      };
    },
    toToolDef: () => tool.toToolDef(),
  };
}
