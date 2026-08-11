import { describe, expect, it, mock } from "bun:test";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import type { Tool as McpToolDef } from "@modelcontextprotocol/sdk/types.js";
import { McpToolBridge, mcpToolName } from "../../src/mcp/tool-bridge.js";

function fakeClient(callTool: (...args: unknown[]) => unknown): Client {
  return { callTool: mock(callTool) } as unknown as Client;
}

const def: McpToolDef = {
  name: "search",
  description: "search things",
  inputSchema: { type: "object", properties: { q: { type: "string" } }, required: ["q"] },
};

describe("mcpToolName", () => {
  it("namespaces as mcp__<server>__<tool>", () => {
    expect(mcpToolName("exa", "web_search")).toBe("mcp__exa__web_search");
  });
});

describe("McpToolBridge", () => {
  it("exposes name/description/schema/permission from the MCP tool def", () => {
    const bridge = new McpToolBridge(
      "exa",
      def,
      fakeClient(() => ({ content: [] })),
    );
    expect(bridge.name).toBe("mcp__exa__search");
    expect(bridge.description).toBe("search things");
    expect(bridge.permission).toBe("prompt");
    expect(bridge.inputSchema).toEqual(def.inputSchema as unknown as Record<string, unknown>);
  });

  it("falls back to a generated description when the server omits one", () => {
    const bare: McpToolDef = { name: "noop", inputSchema: { type: "object" } };
    const bridge = new McpToolBridge(
      "srv",
      bare,
      fakeClient(() => ({ content: [] })),
    );
    expect(bridge.description).toContain("noop");
    expect(bridge.description).toContain("srv");
  });

  it("proxies execute() to client.callTool and joins text blocks", async () => {
    const callTool = mock(async (params: unknown) => {
      expect(params).toEqual({ name: "search", arguments: { q: "cats" } });
      return {
        content: [
          { type: "text", text: "result 1" },
          { type: "text", text: "result 2" },
        ],
      };
    });
    const bridge = new McpToolBridge("exa", def, fakeClient(callTool));
    const result = await bridge.execute({ q: "cats" }, { workingDir: "/tmp" });
    expect(result.isError).toBe(false);
    expect(result.content).toBe("result 1\nresult 2");
    expect(callTool).toHaveBeenCalledTimes(1);
  });

  it("surfaces isError from the MCP result", async () => {
    const bridge = new McpToolBridge(
      "exa",
      def,
      fakeClient(async () => ({ content: [{ type: "text", text: "boom" }], isError: true })),
    );
    const result = await bridge.execute({ q: "x" }, { workingDir: "/tmp" });
    expect(result.isError).toBe(true);
    expect(result.content).toBe("boom");
  });

  it("returns an error ToolResult when callTool throws", async () => {
    const bridge = new McpToolBridge(
      "exa",
      def,
      fakeClient(async () => {
        throw new Error("connection lost");
      }),
    );
    const result = await bridge.execute({ q: "x" }, { workingDir: "/tmp" });
    expect(result.isError).toBe(true);
    expect(result.content).toContain("connection lost");
  });

  it("does not validate input against the schema (trusts the MCP server)", async () => {
    const callTool = mock(async () => ({ content: [{ type: "text", text: "ok" }] }));
    const bridge = new McpToolBridge("exa", def, fakeClient(callTool));
    const result = await bridge.execute({}, { workingDir: "/tmp" });
    expect(result.isError).toBe(false);
  });

  it("toToolDef mirrors name/description/inputSchema", () => {
    const bridge = new McpToolBridge(
      "exa",
      def,
      fakeClient(() => ({ content: [] })),
    );
    expect(bridge.toToolDef()).toEqual({
      name: "mcp__exa__search",
      description: "search things",
      inputSchema: def.inputSchema as unknown as Record<string, unknown>,
    });
  });
});
