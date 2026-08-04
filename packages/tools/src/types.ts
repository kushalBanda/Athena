import type { ToolDef } from "@athena/providers";

export interface ToolContext {
  workingDir: string;
}

export interface ToolResult {
  content: string;
  isError: boolean;
}

export interface Tool {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: Record<string, unknown>;
  readonly permission: "auto" | "prompt";
  execute(input: unknown, ctx: ToolContext): Promise<ToolResult>;
  toToolDef(): ToolDef;
}
