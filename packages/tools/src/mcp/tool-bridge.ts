import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import type { Tool as McpToolDef } from "@modelcontextprotocol/sdk/types.js";
import type { ToolDef } from "@athena/providers";
import type { Tool, ToolContext, ToolResult } from "../types.js";

/** `mcp__<serverName>__<toolName>` — matches the double-underscore MCP naming convention. */
export function mcpToolName(serverName: string, toolName: string): string {
  return `mcp__${serverName}__${toolName}`;
}

/**
 * Wraps a single MCP-discovered tool as an Athena `Tool`. Input validation
 * is intentionally skipped here (unlike `BaseTool`): MCP tool schemas are
 * raw JSON Schema from the remote server, not TypeBox, and we trust the
 * server's own `callTool()` to reject malformed input. `permission` is
 * always `"prompt"` — MCP tools are arbitrary external capabilities, not
 * vetted built-ins.
 */
export class McpToolBridge implements Tool {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: Record<string, unknown>;
  readonly permission = "prompt" as const;

  constructor(
    private serverName: string,
    private def: McpToolDef,
    private client: Client,
    private timeoutMs?: number,
  ) {
    this.name = mcpToolName(serverName, def.name);
    this.description = def.description ?? `MCP tool "${def.name}" from server "${serverName}"`;
    this.inputSchema = (def.inputSchema as unknown as Record<string, unknown>) ?? { type: "object" };
  }

  async execute(input: unknown, _ctx: ToolContext): Promise<ToolResult> {
    try {
      const result = await this.client.callTool(
        { name: this.def.name, arguments: (input as Record<string, unknown>) ?? {} },
        undefined,
        this.timeoutMs !== undefined ? { timeout: this.timeoutMs } : undefined,
      );

      const content = Array.isArray(result.content)
        ? result.content
            .map((block) => {
              if (block.type === "text") return block.text;
              return JSON.stringify(block);
            })
            .join("\n")
        : JSON.stringify(result);

      return { content: content || "(no output)", isError: Boolean(result.isError) };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { content: `MCP tool call failed: ${message}`, isError: true };
    }
  }

  toToolDef(): ToolDef {
    return { name: this.name, description: this.description, inputSchema: this.inputSchema };
  }
}
