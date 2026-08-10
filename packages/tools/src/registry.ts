import type { Tool } from "./types.js";
import { ReadFileTool } from "./impl/read-file.js";
import { WriteFileTool } from "./impl/write-file.js";
import { EditFileTool } from "./impl/edit-file.js";
import { ListDirectoryTool } from "./impl/list-directory.js";
import { GrepTool } from "./impl/grep.js";
import { FindTool } from "./impl/find.js";
import { ShellExecTool } from "./impl/shell-exec.js";
import { WebSearchTool } from "./impl/web-search.js";
import { WebFetchTool } from "./impl/web-fetch.js";
import { CodegraphQueryTool } from "./impl/codegraph-query.js";
import { loadMcpConfig, isServerEnabled } from "./mcp/config.js";
import { connectMcpServer } from "./mcp/client.js";
import { McpToolBridge } from "./mcp/tool-bridge.js";
import { InMemoryMcpOAuthStore, type McpOAuthStore } from "./mcp/oauth.js";

export class ToolRegistry {
  private tools = new Map<string, Tool>();

  register(tool: Tool): this {
    this.tools.set(tool.name, tool);
    return this;
  }

  get(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  all(): Tool[] {
    return [...this.tools.values()];
  }
}

export interface DefaultToolsConfig {
  exaApiKey?: string;
}

export function createDefaultRegistry(config: DefaultToolsConfig = {}): ToolRegistry {
  return new ToolRegistry()
    .register(new ReadFileTool())
    .register(new WriteFileTool())
    .register(new EditFileTool())
    .register(new ListDirectoryTool())
    .register(new GrepTool())
    .register(new FindTool())
    .register(new ShellExecTool())
    .register(new WebSearchTool(config.exaApiKey))
    .register(new WebFetchTool())
    .register(new CodegraphQueryTool());
}

export interface McpConnectionReport {
  server: string;
  status: "connected" | "failed" | "needs_auth" | "disabled";
  error?: string;
  toolCount?: number;
}

export interface RegistryWithMcpConfig extends DefaultToolsConfig {
  /** Project root used to resolve `.athena/mcp.json` and local-server `cwd`. Defaults to `process.cwd()`. */
  projectRoot?: string;
  /** Store for OAuth client info / tokens / PKCE verifiers. Defaults to an in-memory store. */
  oauthStore?: McpOAuthStore;
}

export async function createRegistryWithMcp(
  config: RegistryWithMcpConfig = {},
): Promise<{ registry: ToolRegistry; connections: McpConnectionReport[] }> {
  const registry = createDefaultRegistry(config);
  const projectRoot = config.projectRoot ?? process.cwd();
  const oauthStore = config.oauthStore ?? new InMemoryMcpOAuthStore();
  const mcpConfig = loadMcpConfig(projectRoot);

  const connections: McpConnectionReport[] = await Promise.all(
    Object.entries(mcpConfig).map(async ([name, serverConfig]) => {
      if (!isServerEnabled(serverConfig)) {
        return { server: name, status: "disabled" as const };
      }
      const result = await connectMcpServer(name, serverConfig, { cwd: projectRoot, oauthStore });
      if (result.status === "connected" && result.client && result.tools) {
        for (const def of result.tools) {
          registry.register(new McpToolBridge(name, def, result.client, serverConfig.timeout));
        }
        return { server: name, status: "connected" as const, toolCount: result.tools.length };
      }
      const report: McpConnectionReport = { server: name, status: result.status };
      if (result.error !== undefined) report.error = result.error;
      return report;
    }),
  );

  return { registry, connections };
}
