import type { Tool, ToolContext } from "@athena/tools";
import type { AgentCallbacks, ToolCall, ToolResult } from "./types.js";

export async function runTool(
  call: ToolCall,
  registry: Map<string, Tool>,
  ctx: ToolContext,
  callbacks: AgentCallbacks,
): Promise<ToolResult> {
  const tool = registry.get(call.name);

  if (!tool) {
    return {
      toolCallId: call.id,
      content: `tool not found: ${call.name}`,
      isError: true,
    };
  }

  if (tool.permission === "prompt") {
    const allowed = callbacks.onPermissionRequest
      ? await callbacks.onPermissionRequest(call.name, call.input)
      : false;

    if (!allowed) {
      return {
        toolCallId: call.id,
        content: `permission denied for tool: ${call.name}`,
        isError: true,
      };
    }
  }

  try {
    const result = await tool.execute(call.input, ctx);
    return {
      toolCallId: call.id,
      content: result.content,
      isError: result.isError,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      toolCallId: call.id,
      content: `tool error: ${message}`,
      isError: true,
    };
  }
}
