import { type TObject, type TProperties, type Static } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";
import type { ToolDef } from "@athena/providers";
import type { Tool, ToolContext, ToolResult } from "./types.js";

export abstract class BaseTool<T extends TObject<TProperties>> implements Tool {
  abstract readonly name: string;
  abstract readonly description: string;
  abstract readonly permission: "auto" | "prompt";
  abstract readonly schema: T;

  get inputSchema(): Record<string, unknown> {
    return this.schema as unknown as Record<string, unknown>;
  }

  async execute(input: unknown, ctx: ToolContext): Promise<ToolResult> {
    if (!Value.Check(this.schema, input)) {
      const errors = [...Value.Errors(this.schema, input)].map((e) => `${e.path}: ${e.message}`);
      return { content: `Invalid input: ${errors.join(", ")}`, isError: true };
    }
    return this.run(input as Static<T>, ctx);
  }

  toToolDef(): ToolDef {
    return {
      name: this.name,
      description: this.description,
      inputSchema: this.inputSchema,
    };
  }

  protected abstract run(input: Static<T>, ctx: ToolContext): Promise<ToolResult>;
}

export function ok(content: string): ToolResult {
  return { content, isError: false };
}

export function err(content: string): ToolResult {
  return { content, isError: true };
}
