import { connectMcpServer, isServerEnabled, loadMcpConfig, type McpServerConfig } from "@athena/tools";
import { FileMcpOAuthStore } from "./auth.js";
import {
  loadGlobalMcpServers,
  loadProjectMcpServers,
  removeGlobalMcpServer,
  removeProjectMcpServer,
  saveGlobalMcpServer,
  saveProjectMcpServer,
} from "./config.js";

export interface McpAddOptions {
  name: string;
  local?: string;
  remote?: string;
  project?: boolean;
  cwd?: string;
  timeout?: number;
}

export interface McpAddResult {
  ok: boolean;
  message: string;
}

/** Splits a shell-style command string into argv, respecting simple quoting. */
export function splitCommand(command: string): string[] {
  const matches = command.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) ?? [];
  return matches.map((part) => part.replace(/^["']|["']$/g, ""));
}

/** Adds a server to the global or project-local MCP config. Pure/testable — no process.exit. */
export function mcpAdd(opts: McpAddOptions, projectRoot: string): McpAddResult {
  if (!opts.name) return { ok: false, message: "Usage: athena mcp add <name> --local \"<cmd>\" | --remote <url>" };
  if (!opts.local && !opts.remote) {
    return { ok: false, message: "Specify either --local \"<command>\" or --remote <url>" };
  }
  if (opts.local && opts.remote) {
    return { ok: false, message: "Specify only one of --local or --remote, not both" };
  }

  const server: McpServerConfig = opts.local
    ? { type: "local", command: splitCommand(opts.local), ...(opts.timeout ? { timeout: opts.timeout } : {}) }
    : { type: "remote", url: opts.remote!, ...(opts.timeout ? { timeout: opts.timeout } : {}) };

  if (opts.project) {
    saveProjectMcpServer(projectRoot, opts.name, server);
    return { ok: true, message: `Added MCP server "${opts.name}" to ${projectRoot}/.athena/mcp.json` };
  }
  saveGlobalMcpServer(opts.name, server);
  return { ok: true, message: `Added MCP server "${opts.name}" to global config` };
}

export interface McpRemoveResult {
  ok: boolean;
  message: string;
}

/** Removes a server by name from whichever config (project takes precedence, then global) has it. */
export function mcpRemove(name: string, projectRoot: string): McpRemoveResult {
  if (removeProjectMcpServer(projectRoot, name)) {
    return { ok: true, message: `Removed "${name}" from project config (.athena/mcp.json)` };
  }
  if (removeGlobalMcpServer(name)) {
    return { ok: true, message: `Removed "${name}" from global config` };
  }
  return { ok: false, message: `No MCP server named "${name}" found in project or global config` };
}

export interface McpListEntry {
  name: string;
  scope: "project" | "global";
  type: "local" | "remote";
  status: "connected" | "failed" | "needs_auth" | "disabled";
  error?: string;
  toolCount?: number;
}

/** Lists configured servers and, unless `skipConnect`, attempts a live connection to report status. */
export async function mcpList(projectRoot: string, opts: { skipConnect?: boolean } = {}): Promise<McpListEntry[]> {
  const project = loadProjectMcpServers(projectRoot);
  const merged = loadMcpConfig(projectRoot);

  const oauthStore = new FileMcpOAuthStore();
  const entries: McpListEntry[] = [];

  for (const [name, cfg] of Object.entries(merged)) {
    const scope: "project" | "global" = name in project ? "project" : "global";

    if (cfg.enabled === false) {
      entries.push({ name, scope, type: cfg.type, status: "disabled" });
      continue;
    }
    if (opts.skipConnect) {
      entries.push({ name, scope, type: cfg.type, status: "connected" });
      continue;
    }

    const result = await connectMcpServer(name, cfg, { cwd: projectRoot, oauthStore });
    const entry: McpListEntry = { name, scope, type: cfg.type, status: result.status };
    if (result.error !== undefined) entry.error = result.error;
    if (result.tools !== undefined) entry.toolCount = result.tools.length;
    if (result.client) await result.client.close().catch(() => {});
    entries.push(entry);
  }

  return entries;
}

export interface McpToggleResult {
  ok: boolean;
  message: string;
  enabled?: boolean;
}

/** Flips a server's `enabled` flag in whichever config (project, else global) has it. */
export function mcpToggle(name: string, projectRoot: string): McpToggleResult {
  const project = loadProjectMcpServers(projectRoot);
  if (name in project) {
    const cfg = project[name] as McpServerConfig;
    const enabled = !isServerEnabled(cfg);
    saveProjectMcpServer(projectRoot, name, { ...cfg, enabled });
    return { ok: true, message: `"${name}" → ${enabled ? "enabled" : "disabled"}`, enabled };
  }
  const global = loadGlobalMcpServers();
  if (name in global) {
    const cfg = global[name] as McpServerConfig;
    const enabled = !isServerEnabled(cfg);
    saveGlobalMcpServer(name, { ...cfg, enabled });
    return { ok: true, message: `"${name}" → ${enabled ? "enabled" : "disabled"}`, enabled };
  }
  return { ok: false, message: `No MCP server named "${name}" found` };
}

export interface McpPickerEntry {
  name: string;
  scope: "project" | "global";
  type: "local" | "remote";
  enabled: boolean;
}

export function mcpPickerEntries(projectRoot: string): McpPickerEntry[] {
  const project = loadProjectMcpServers(projectRoot);
  const merged = loadMcpConfig(projectRoot);
  return Object.entries(merged).map(([name, cfg]) => ({
    name,
    scope: name in project ? ("project" as const) : ("global" as const),
    type: cfg.type,
    enabled: isServerEnabled(cfg),
  }));
}

export interface McpPickerOption {
  label: string;
  value: string;
  hint: string;
  tone: "success" | "muted";
}

/** Structured picker row: name/scope/type as the label, enabled state as a colored hint. */
export function formatMcpPickerOption(entry: McpPickerEntry): McpPickerOption {
  return {
    label: `${entry.name}  [${entry.scope}/${entry.type}]`,
    value: entry.name,
    hint: entry.enabled ? "✓ enabled" : "○ disabled",
    tone: entry.enabled ? "success" : "muted",
  };
}

export function formatMcpListEntry(entry: McpListEntry): string {
  const statusLabel =
    entry.status === "connected"
      ? `connected${entry.toolCount !== undefined ? ` (${entry.toolCount} tools)` : ""}`
      : entry.status === "failed"
        ? `failed${entry.error ? `: ${entry.error}` : ""}`
        : entry.status;
  return `  ${entry.name}  [${entry.scope}/${entry.type}]  ${statusLabel}`;
}
