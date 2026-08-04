import type { Tool } from "./types.js";
import { ReadFileTool } from "./impl/read-file.js";
import { WriteFileTool } from "./impl/write-file.js";
import { ListDirectoryTool } from "./impl/list-directory.js";
import { GrepTool } from "./impl/grep.js";
import { FindTool } from "./impl/find.js";
import { ShellExecTool } from "./impl/shell-exec.js";
import { WebSearchTool } from "./impl/web-search.js";
import { WebFetchTool } from "./impl/web-fetch.js";

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
    .register(new ListDirectoryTool())
    .register(new GrepTool())
    .register(new FindTool())
    .register(new ShellExecTool())
    .register(new WebSearchTool(config.exaApiKey))
    .register(new WebFetchTool());
}
