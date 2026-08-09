import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export interface McpOAuthConfig {
  clientId?: string;
  clientSecret?: string;
  scope?: string;
  callbackPort?: number;
  redirectUri?: string;
}

export interface McpLocalServerConfig {
  type: "local";
  command: string[];
  cwd?: string;
  env?: Record<string, string>;
  enabled?: boolean;
  timeout?: number;
}

export interface McpRemoteServerConfig {
  type: "remote";
  url: string;
  headers?: Record<string, string>;
  oauth?: McpOAuthConfig | false;
  enabled?: boolean;
  timeout?: number;
}

export type McpServerConfig = McpLocalServerConfig | McpRemoteServerConfig;

export type McpConfigFile = Record<string, McpServerConfig>;

function athenaConfigDir(): string {
  return process.env.ATHENA_CONFIG_DIR ?? join(homedir(), ".config", "athena");
}

export function globalMcpConfigPath(): string {
  return join(athenaConfigDir(), "config.json");
}

export function projectMcpConfigPath(projectRoot: string): string {
  return join(projectRoot, ".athena", "mcp.json");
}

function readJsonFile(path: string): Record<string, unknown> {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function isValidServerConfig(value: unknown): value is McpServerConfig {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  if (v.type === "local") return Array.isArray(v.command);
  if (v.type === "remote") return typeof v.url === "string";
  return false;
}

/** Reads the `mcp` block out of the global `config.json`. */
export function readGlobalMcpConfig(): McpConfigFile {
  const file = readJsonFile(globalMcpConfigPath());
  const mcp = file.mcp;
  if (typeof mcp !== "object" || mcp === null) return {};
  const result: McpConfigFile = {};
  for (const [name, cfg] of Object.entries(mcp as Record<string, unknown>)) {
    if (isValidServerConfig(cfg)) result[name] = cfg;
  }
  return result;
}

/** Reads project-local `.athena/mcp.json`, if present. */
export function readProjectMcpConfig(projectRoot: string): McpConfigFile {
  const path = projectMcpConfigPath(projectRoot);
  if (!existsSync(path)) return {};
  const file = readJsonFile(path);
  const result: McpConfigFile = {};
  for (const [name, cfg] of Object.entries(file)) {
    if (isValidServerConfig(cfg)) result[name] = cfg;
  }
  return result;
}


export function mergeMcpConfigs(global: McpConfigFile, project: McpConfigFile): McpConfigFile {
  return { ...global, ...project };
}

/** Loads and merges global + project-local MCP config for a given project root. */
export function loadMcpConfig(projectRoot: string): McpConfigFile {
  return mergeMcpConfigs(readGlobalMcpConfig(), readProjectMcpConfig(projectRoot));
}

export function isServerEnabled(cfg: McpServerConfig): boolean {
  return cfg.enabled !== false;
}

function writeJsonFile(path: string, data: Record<string, unknown>): void {
  const dir = dirname(path);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true, mode: 0o700 });
  writeFileSync(path, JSON.stringify(data, null, 2), "utf8");
}

/** Adds/overwrites one server entry under the `mcp` block of the global `config.json`, preserving other keys. */
export function saveGlobalMcpServer(name: string, server: McpServerConfig): void {
  const file = readJsonFile(globalMcpConfigPath());
  const mcp = typeof file.mcp === "object" && file.mcp !== null ? (file.mcp as Record<string, unknown>) : {};
  writeJsonFile(globalMcpConfigPath(), { ...file, mcp: { ...mcp, [name]: server } });
}

/** Removes a server entry from the global `config.json`'s `mcp` block. Returns whether it existed. */
export function removeGlobalMcpServer(name: string): boolean {
  const file = readJsonFile(globalMcpConfigPath());
  const mcp = typeof file.mcp === "object" && file.mcp !== null ? (file.mcp as Record<string, unknown>) : {};
  if (!(name in mcp)) return false;
  const { [name]: _removed, ...rest } = mcp;
  writeJsonFile(globalMcpConfigPath(), { ...file, mcp: rest });
  return true;
}

/** Adds/overwrites one server entry in `<projectRoot>/.athena/mcp.json`. */
export function saveProjectMcpServer(projectRoot: string, name: string, server: McpServerConfig): void {
  const path = projectMcpConfigPath(projectRoot);
  const file = readJsonFile(path);
  writeJsonFile(path, { ...file, [name]: server });
}

/** Removes a server entry from `<projectRoot>/.athena/mcp.json`. Returns whether it existed. */
export function removeProjectMcpServer(projectRoot: string, name: string): boolean {
  const path = projectMcpConfigPath(projectRoot);
  const file = readJsonFile(path);
  if (!(name in file)) return false;
  const { [name]: _removed, ...rest } = file;
  writeJsonFile(path, rest);
  return true;
}
