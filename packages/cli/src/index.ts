#!/usr/bin/env node
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  DEFAULT_COMPACTION_SETTINGS,
  SessionManager,
  compact,
  diffNewMessages,
  loadSkills,
  newId,
  runAgent,
} from "@athena/agent-core";
import type { ActiveToolCall, AgentMessage, Skill } from "@athena/agent-core";
import { getTracer, initTelemetry, shutdownTelemetry } from "@athena/observability";
import { PROVIDER_EFFORT_LEVELS, createProvider } from "@athena/providers";
import type { EffortLevel, ProviderName } from "@athena/providers";
import {
  createRegistryWithMcp,
  formatIndexStatusLine,
  getIndexStatus,
  runCodegraphSetup,
} from "@athena/tools";
import { TuiApp } from "@athena/tui";
import type { PickerOption, AgentCallbacks as TuiCallbacks } from "@athena/tui";
import { SpanKind } from "@opentelemetry/api";
import { agentMessagesToTuiMessages, createCallbacks, finalizeStream } from "./adapter.js";
import type { AdapterState } from "./adapter.js";
import {
  FileMcpOAuthStore,
  autoDetectProvider,
  getApiKey,
  getConfiguredProviders,
  getOAuthCredential,
  getOtlpHeaders,
  listKeys,
  registerOAuthRefresher,
  setApiKey,
  setOAuthCredential,
} from "./auth.js";
import type { StoredOAuthCredential } from "./auth.js";
import { expandPromptTemplate, loadCommandTemplates } from "./commands.js";
import type { CommandTemplate } from "./commands.js";
import {
  loadConfig,
  loadContextSourcesConfig,
  loadObservabilityConfig,
  loadPermissionsConfig,
  resolveProviderConfig,
  saveAlwaysAllow,
  saveConfig,
  saveContextSourcesConfig,
} from "./config.js";
import type { ContextSourcesSettings } from "./config.js";
import {
  formatMcpListEntry,
  formatMcpPickerOption,
  mcpAdd,
  mcpList,
  mcpPickerEntries,
  mcpRemove,
  mcpToggle,
} from "./mcp-commands.js";
import { MODEL_CATALOG } from "./models.js";
import { loginAnthropic, refreshAnthropic } from "./oauth/anthropic-oauth.js";
import { loginCodex, refreshCodex } from "./oauth/codex-oauth.js";
import type { LoginUI } from "./oauth/login-ui.js";
import { PROVIDER_META, getProviderMeta } from "./provider-meta.js";
import { runSetup } from "./setup.js";
import type { SetupResult } from "./setup.js";

interface CliArgs {
  print: boolean;
  message: string | null;
  provider: string | null;
  model: string | null;
  subcommand: string | null;
  continueSession: boolean;
  resumeSessionId: string | null;
}

function parseArgs(argv: string[]): CliArgs {
  const args = argv.slice(2);
  const result: CliArgs = {
    print: false,
    message: null,
    provider: null,
    model: null,
    subcommand: null,
    continueSession: false,
    resumeSessionId: null,
  };

  const first = args[0];
  if (first === "auth" || first === "setup" || first === "status" || first === "mcp") {
    result.subcommand = first;
    return result;
  }

  for (let i = 0; i < args.length; i++) {
    const a = args[i] ?? "";
    if (a === "--print" || a === "-p") {
      result.print = true;
      const next = args[i + 1];
      if (next !== undefined && !next.startsWith("-")) {
        result.message = next;
        i++;
      }
    } else if (a === "--provider" && args[i + 1]) {
      result.provider = args[++i] ?? null;
    } else if (a === "--model" && args[i + 1]) {
      result.model = args[++i] ?? null;
    } else if (a === "--continue" || a === "-c") {
      result.continueSession = true;
    } else if (a === "--resume" && args[i + 1]) {
      result.resumeSessionId = args[++i] ?? null;
    } else if (a === "--help" || a === "-h") {
      printHelp();
      process.exit(0);
    } else if (!a.startsWith("-")) {
      result.message = a;
    }
  }

  return result;
}

function printHelp() {
  console.log(`athena — AI coding agent

Usage:
  athena                              interactive TUI
  athena -p "task"                    non-interactive, print to stdout and exit
  athena --continue, -c               resume the most recent session for this directory
                                      (also works with -p, to continue a scripted session)
  athena --resume <session-id>        resume a specific session by id (printed on exit)
  athena --provider <name>            override provider: anthropic|ollama|gemini|azure|bedrock|openai-codex
  athena --model <id>                 override model id

  athena setup                        interactive first-run setup (choose provider + key)
  athena status                       show current config and stored keys
  athena auth set <provider> <key>    store API key in ~/.config/athena/auth.json
  athena auth login <provider>        sign in via subscription OAuth (anthropic|openai-codex)
  athena auth list                    list stored providers

  athena mcp add <name>               add an MCP server (--local "<cmd>" | --remote <url>) [--project]
  athena mcp list                     list configured MCP servers + live connection status
  athena mcp remove <name>            remove an MCP server (project config wins, else global)
`);
}

const OAUTH_LOGINS: Partial<Record<string, () => Promise<StoredOAuthCredential>>> = {
  anthropic: loginAnthropic,
  "openai-codex": loginCodex,
};

/**
 * `/login` targets — deliberately separate from `PROVIDER_META`/`/provider`.
 * `/provider` picks *how a configured provider is used*; `/login` is the
 * one place that starts a subscription OAuth flow (Claude Code, Codex).
 * Anthropic api-key auth and Gemini/Azure/Bedrock have no subscription
 * login and stay `/provider`-only.
 */
const LOGIN_TARGETS: readonly {
  provider: string;
  label: string;
  login: (ui: LoginUI) => Promise<StoredOAuthCredential>;
}[] = [
  {
    provider: "anthropic",
    label: "Claude Code (Claude Pro/Max subscription)",
    login: loginAnthropic,
  },
  { provider: "openai-codex", label: "Codex (ChatGPT Plus/Pro subscription)", login: loginCodex },
];

async function handleAuthCommand(argv: string[]): Promise<boolean> {
  if (argv[2] !== "auth") return false;

  const action = argv[3];
  if (action === "set") {
    const provider = argv[4];
    const key = argv[5];
    if (!provider || !key) {
      console.error("Usage: athena auth set <provider> <api-key>");
      process.exit(1);
    }
    setApiKey(provider, key);
    return true;
  }
  if (action === "login") {
    const provider = argv[4];
    const login = provider ? OAUTH_LOGINS[provider] : undefined;
    if (!provider || !login) {
      console.error(
        `Usage: athena auth login <provider>\nSupported: ${Object.keys(OAUTH_LOGINS).join(", ")}`,
      );
      process.exit(1);
    }
    try {
      const cred = await login();
      setOAuthCredential(provider, cred);
      console.log(`\nSigned in to ${provider} via subscription. Run "athena" to start using it.`);
    } catch (err) {
      console.error(`Login failed: ${err instanceof Error ? err.message : String(err)}`);
      process.exit(1);
    }
    return true;
  }
  if (action === "list" || action === undefined) {
    listKeys();
    return true;
  }
  console.error(
    `Unknown auth action: ${action}. Use: athena auth set <provider> <key> | athena auth login <provider>`,
  );
  process.exit(1);
}

function handleStatusCommand() {
  const configured = getConfiguredProviders();
  const auto = autoDetectProvider();
  const cfg = loadConfig();
  const codegraphStatus = getIndexStatus(process.cwd());

  console.log("athena status\n");
  console.log(`  config file : ~/.config/athena/config.json`);
  console.log(`  auth file   : ~/.config/athena/auth.json`);
  console.log(`  provider    : ${cfg.provider}${auto === cfg.provider ? " (auto-detected)" : ""}`);
  if (cfg.model) console.log(`  model       : ${cfg.model}`);
  console.log(`  ${formatIndexStatusLine(codegraphStatus)}`);
  console.log("");
  if (configured.length === 0) {
    console.log("  No API keys stored. Run: athena setup");
  } else {
    console.log("  Stored keys:");
    listKeys();
  }
}

async function handleMcpCommand(argv: string[]): Promise<void> {
  const action = argv[3];
  const cwd = process.cwd();

  if (action === "add") {
    const name = argv[4];
    let local: string | undefined;
    let remote: string | undefined;
    let project = false;
    for (let i = 5; i < argv.length; i++) {
      const a = argv[i];
      if (a === "--local" && argv[i + 1]) local = argv[++i];
      else if (a === "--remote" && argv[i + 1]) remote = argv[++i];
      else if (a === "--project") project = true;
    }
    if (!name) {
      console.error('Usage: athena mcp add <name> --local "<cmd>" | --remote <url> [--project]');
      process.exit(1);
    }
    const result = mcpAdd(
      {
        name,
        project,
        ...(local !== undefined ? { local } : {}),
        ...(remote !== undefined ? { remote } : {}),
      },
      cwd,
    );
    console.log(result.message);
    process.exit(result.ok ? 0 : 1);
  }

  if (action === "list" || action === undefined) {
    const entries = await mcpList(cwd);
    if (entries.length === 0) {
      console.log(
        'No MCP servers configured. Run: athena mcp add <name> --local "<cmd>" | --remote <url>',
      );
      return;
    }
    console.log("MCP servers:\n");
    for (const entry of entries) console.log(formatMcpListEntry(entry));
    return;
  }

  if (action === "remove") {
    const name = argv[4];
    if (!name) {
      console.error("Usage: athena mcp remove <name>");
      process.exit(1);
    }
    const result = mcpRemove(name, cwd);
    console.log(result.message);
    process.exit(result.ok ? 0 : 1);
  }

  console.error(`Unknown mcp action: ${action}. Use: add | list | remove`);
  process.exit(1);
}

function agentDir(): string {
  return process.env.ATHENA_CONFIG_DIR ?? join(homedir(), ".config", "athena");
}

function resolveProvider(args: CliArgs, cfg: ReturnType<typeof loadConfig>): string {
  if (args.provider) return args.provider;
  if (cfg.provider !== "anthropic") return cfg.provider;
  const detected = autoDetectProvider();
  return detected ?? cfg.provider;
}

/**
 * "Always allow" grants are scoped per tool, except `shell_exec`, which is scoped
 * per command prefix (first two whitespace-delimited tokens, e.g. `"npm uninstall"`)
 * so granting one command doesn't blanket-approve every future shell invocation.
 */
function permissionScope(toolName: string, input: unknown): { key: string; label: string } {
  if (toolName === "shell_exec" && input !== null && typeof input === "object") {
    const raw = (input as { command?: unknown }).command;
    const command = typeof raw === "string" ? raw.trim() : "";
    const prefix = command.split(/\s+/).filter(Boolean).slice(0, 2).join(" ");
    if (prefix) return { key: `shell_exec:${prefix}`, label: `${prefix}:*` };
  }
  return { key: toolName, label: toolName };
}

registerOAuthRefresher("anthropic", refreshAnthropic);
registerOAuthRefresher("openai-codex", refreshCodex);

async function main() {
  const args = parseArgs(process.argv);

  if (args.subcommand === "auth") {
    await handleAuthCommand(process.argv);
    return;
  }
  if (args.subcommand === "setup") {
    await runSetup();
    return;
  }
  if (args.subcommand === "status") {
    handleStatusCommand();
    return;
  }
  if (args.subcommand === "mcp") {
    await handleMcpCommand(process.argv);
    return;
  }

  // Auto-setup CodeGraph for this session, non-blocking.
  void runCodegraphSetup(process.cwd());

  const obsConfig = loadObservabilityConfig();
  const otlpHeaders = getOtlpHeaders();
  initTelemetry({
    enabled: obsConfig.enabled,
    ...(obsConfig.otlpEndpoint !== undefined ? { otlpEndpoint: obsConfig.otlpEndpoint } : {}),
    ...(otlpHeaders !== undefined ? { otlpHeaders } : {}),
  });

  const sessionSpan = getTracer().startSpan("athena.session", {
    kind: SpanKind.SERVER,
    attributes: { "athena.version": "0.1.0" },
  });

  let shuttingDown = false;
  async function shutdown(): Promise<void> {
    if (shuttingDown) return;
    shuttingDown = true;
    sessionSpan.end();
    await shutdownTelemetry();
  }

  let currentTurnAbort: AbortController | null = null;
  let liveTui: TuiCallbacks | null = null;
  let unmountApp: (() => void) | null = null;

  const CTRL_C_EXIT_WINDOW_MS = 2000;
  let ctrlCArmedAt: number | null = null;
  let ctrlCArmedTimer: ReturnType<typeof setTimeout> | null = null;

  function disarmCtrlC(): void {
    ctrlCArmedAt = null;
    if (ctrlCArmedTimer) {
      clearTimeout(ctrlCArmedTimer);
      ctrlCArmedTimer = null;
    }
    liveTui?.setCtrlCArmed(false);
  }

  function exitGracefully(sessionId: string | undefined): void {
    unmountApp?.();
    void shutdown().then(() => {
      if (sessionId) {
        process.stdout.write(`\nTo resume this session:\n  athena --resume ${sessionId}\n`);
      }
      process.exit(0);
    });
  }

  function handleSigint(): void {
    if (currentTurnAbort) {
      currentTurnAbort.abort();
      return;
    }
    const now = Date.now();
    if (ctrlCArmedAt !== null && now - ctrlCArmedAt < CTRL_C_EXIT_WINDOW_MS) {
      if (ctrlCArmedTimer) clearTimeout(ctrlCArmedTimer);
      exitGracefully(sessionManager?.getSessionId());
      return;
    }
    ctrlCArmedAt = now;
    liveTui?.setCtrlCArmed(true);
    ctrlCArmedTimer = setTimeout(disarmCtrlC, CTRL_C_EXIT_WINDOW_MS);
  }

  function handleSigterm(): void {
    if (currentTurnAbort) {
      currentTurnAbort.abort();
      return;
    }
    unmountApp?.();
    void shutdown().then(() => process.exit(0));
  }

  process.on("SIGINT", handleSigint);
  process.on("SIGTERM", handleSigterm);

  let cfg = loadConfig();
  let providerName = resolveProvider(args, cfg) as Parameters<typeof createProvider>[0];

  const needsKey = providerName !== "ollama";
  const staticHasKey = (cfg.providerConfig as Record<string, { apiKey?: string }>)[providerName]
    ?.apiKey;
  const hasKey = staticHasKey || !!getOAuthCredential(providerName);
  if (needsKey && !hasKey) {
    if (args.print) {
      const oauthHint = OAUTH_LOGINS[providerName] ? ` or athena auth login ${providerName}` : "";
      console.error(
        `athena: no credential for "${providerName}". Run: athena auth set ${providerName} <key>${oauthHint}`,
      );
      await shutdown();
      process.exit(1);
    }
    const result: SetupResult = await runSetup();
    if (result.cancelled) {
      await shutdown();
      process.exit(0);
    }
    cfg = loadConfig();
    providerName = result.provider as Parameters<typeof createProvider>[0];
  }

  const session = {
    provider: createProvider(providerName, await resolveProviderConfig(cfg)),
    cfg,
  };

  const cwd = process.cwd();
  const { registry, connections } = await createRegistryWithMcp({
    projectRoot: cwd,
    oauthStore: new FileMcpOAuthStore(),
  });
  for (const c of connections) {
    if (c.status === "failed")
      console.error(`[mcp] "${c.server}" failed to connect: ${c.error ?? "unknown error"}`);
    else if (c.status === "needs_auth")
      console.error(`[mcp] "${c.server}" needs authentication — run: athena mcp list`);
  }
  const tools = registry.all();
  const alwaysAllowed = new Set(loadPermissionsConfig().alwaysAllow);

  let contextSources: ContextSourcesSettings = loadContextSourcesConfig();
  let skills: Skill[] = loadSkills({
    cwd,
    agentDir: agentDir(),
    enabledSources: { claude: contextSources.claudeSkills },
  });
  let commandTemplates: CommandTemplate[] = loadCommandTemplates({ cwd, agentDir: agentDir() });

  function skillCommandName(skill: Skill): string {
    return `${skill.scope}:${skill.name}`;
  }

  function buildCustomCommandList(): { name: string; description: string }[] {
    return [
      ...commandTemplates.map((t) => ({ name: t.name, description: t.description })),
      ...skills.map((s) => ({
        name: skillCommandName(s),
        description: `${s.description} (${s.source} · ${s.scope}${s.disableModelInvocation ? " · manual-only" : ""})`,
      })),
    ];
  }

  if (args.print) {
    const message = args.message ?? "";
    if (!message) {
      console.error("athena: -p requires a message");
      await shutdown();
      process.exit(1);
    }

    const printSession = args.continueSession
      ? SessionManager.continueRecent(cwd)
      : SessionManager.create(cwd);
    sessionSpan.setAttribute("session.id", printSession.getSessionId());
    const printHistory = printSession.buildSessionContext().messages;

    const printAbort = new AbortController();
    currentTurnAbort = printAbort;

    const printEffort = currentEffort(session.provider.name as ProviderName);
    const printResult = await runAgent(message, {
      provider: session.provider,
      tools,
      cwd,
      sessionHistory: printHistory,
      signal: printAbort.signal,
      skills,
      includeClaudeMd: contextSources.claudeMd,
      ...(printEffort !== undefined ? { effort: printEffort } : {}),
      callbacks: {
        onThinking: () => {},
        onAssistantToken: (t: string) => process.stdout.write(t),
        onToolCall: (c: ActiveToolCall) => console.error(`[tool] ${c.name}`),
        onToolResult: (_id: string, result: string, status: "ok" | "err") => {
          if (status === "err") console.error(`[tool-err] ${result}`);
        },
        onCompacting: () => console.error("[compacting]"),
        onTokenUpdate: () => {},
        onPermissionRequest: async () => true,
      },
    });
    const printWasAborted = printAbort.signal.aborted;
    currentTurnAbort = null;

    for (const m of diffNewMessages(printHistory, printResult.messages)) {
      printSession.appendMessage(m);
    }

    process.stdout.write("\n");
    if (printWasAborted) {
      console.error("athena: cancelled (ctrl+c) — partial turn saved to session");
    }
    await shutdown();
    process.exit(printWasAborted ? 130 : 0);
  }

  let sessionManager = args.resumeSessionId
    ? (SessionManager.findById(cwd, args.resumeSessionId) ?? SessionManager.create(cwd))
    : args.continueSession
      ? SessionManager.continueRecent(cwd)
      : SessionManager.create(cwd);
  if (args.resumeSessionId && !sessionManager.getSessionId().startsWith(args.resumeSessionId)) {
    console.error(
      `athena: no session found matching "${args.resumeSessionId}" — started a new session instead`,
    );
  }
  sessionSpan.setAttribute("session.id", sessionManager.getSessionId());
  let history: AgentMessage[] = sessionManager.buildSessionContext().messages;
  let turnInFlight = false;
  const messageQueue: string[] = [];

  function sysMsg(tui: TuiCallbacks, content: string) {
    tui.addMessage({ id: crypto.randomUUID(), role: "system", content });
  }

  /** Bridges the OAuth login flows' `LoginUI` seam onto the TUI's own prompt/message primitives. */
  function tuiLoginUI(tui: TuiCallbacks): LoginUI {
    return {
      // Login prints the raw OAuth authorize URL as a fallback for when the
      // browser doesn't auto-open — it's one ~250-char token with no spaces
      // to break on. Left as a single message, the terminal wraps it across
      // rows the overlay's positioning doesn't account for, so the
      // paste-code prompt box paints on top of the wrapped remainder
      // instead of below it. Hard-wrapping to terminal width before each
      // `addMessage` keeps every message within one terminal row.
      info: (message) => {
        const width = Math.max(20, (process.stdout.columns || 80) - 4);
        for (const rawLine of message.split("\n")) {
          if (rawLine.length <= width) {
            sysMsg(tui, rawLine);
            continue;
          }
          for (let i = 0; i < rawLine.length; i += width) {
            sysMsg(tui, rawLine.slice(i, i + width));
          }
        }
      },
      // Deliberately no paste-code prompt in the TUI. Locally this always
      // completes via the callback server the moment the browser redirects
      // — the manual-code fallback exists for `athena auth login <provider>`
      // (SSH/headless, no local browser reachable), not for the common
      // local-desktop `/login` path, where showing an input box the user
      // has to look past just to watch it get skipped is pure noise. Wait
      // quietly for the server; resolve `null` only if the login is aborted
      // (server won the race, or the whole login failed).
      promptCode: (_message, signal) =>
        new Promise<string | null>((resolve) => {
          if (signal.aborted) {
            resolve(null);
            return;
          }
          signal.addEventListener("abort", () => resolve(null), { once: true });
        }),
    };
  }

  function currentEffort(provName: ProviderName): EffortLevel | undefined {
    return (session.cfg.providerConfig[provName] as { effort?: EffortLevel } | undefined)?.effort;
  }

  async function handleSlashCommand(text: string, tui: TuiCallbacks): Promise<boolean> {
    const parts = text.slice(1).trim().split(/\s+/);
    const cmd = parts[0]?.toLowerCase();

    if (cmd === "help") {
      sysMsg(
        tui,
        [
          "/model                   switch model (opens picker)",
          "/provider                switch provider (opens picker)",
          "/login                   sign in to Claude Code or Codex via subscription OAuth",
          "/effort                  switch reasoning effort (opens picker)",
          "/status                  show current provider + model",
          "/clear                   clear chat history, start a new session",
          "/compact                 manually compact the session context",
          "/resume                  pick a previous session to resume",
          "/skills                  list loaded skills (name, description, path)",
          "/<scope>:<skill-name>    manually invoke a loaded skill (also shown in autocomplete)",
          "/context-config          toggle CLAUDE.md loading and claude skill loading",
          "/init                    generate CLAUDE.md for this repo",
          "/reload                  reload skills and custom commands",
          "/exit  /quit             quit athena",
        ].join("\n"),
      );
      return true;
    }

    if (cmd === "clear") {
      history = [];
      sessionManager.newSession();
      tui.clearMessages();
      sysMsg(tui, "history cleared, started new session");
      return true;
    }

    if (cmd === "compact") {
      await (async () => {
        if (history.length === 0) {
          sysMsg(tui, "nothing to compact");
          return;
        }
        tui.setStatus({ kind: "compacting" });
        try {
          const result = await compact(history, DEFAULT_COMPACTION_SETTINGS, session.provider);
          const summaryMsg: AgentMessage = {
            id: newId(),
            role: "compaction_summary",
            content: `<compaction-summary>\n${result.summary}\n</compaction-summary>`,
            timestamp: Date.now(),
          };
          const before = history;
          history = [summaryMsg, ...result.retainedTail];
          for (const m of diffNewMessages(before, history)) sessionManager.appendMessage(m);
          tui.clearMessages();
          for (const m of agentMessagesToTuiMessages(history)) tui.addMessage(m);
          sysMsg(
            tui,
            `compacted: ${result.tokensBefore} tokens → summary + ${result.retainedTail.length} kept messages`,
          );
        } finally {
          tui.setStatus({ kind: "ready" });
        }
      })();
      return true;
    }

    if (cmd === "resume") {
      await (async () => {
        const sessions = SessionManager.list(cwd).filter(
          (s) => s.messageCount > 0 && s.id !== sessionManager.getSessionId(),
        );
        if (sessions.length === 0) {
          sysMsg(tui, "no saved sessions for this directory");
          return;
        }
        const labels = sessions.map(
          (s) =>
            `${s.name ?? s.firstMessage.slice(0, 60)} (${s.messageCount} msgs, ${s.modified.toLocaleString()}) [${s.id.slice(0, 8)}]`,
        );
        const picked = await tui.pickFromList("resume session", labels);
        if (!picked) return;
        const index = labels.indexOf(picked);
        const target = sessions[index];
        if (!target) return;
        sessionManager = SessionManager.open(target.path);
        history = sessionManager.buildSessionContext().messages;
        tui.clearMessages();
        for (const m of agentMessagesToTuiMessages(history)) tui.addMessage(m);
        sysMsg(tui, `resumed session ${target.id} (${target.messageCount} msgs)`);
      })();
      return true;
    }

    if (cmd === "status") {
      const configured = getConfiguredProviders();
      const provName = session.provider.name as ProviderName;
      const effort = currentEffort(provName);
      const codegraphStatus = getIndexStatus(process.cwd());
      sysMsg(
        tui,
        [
          `provider : ${session.provider.name}`,
          `model    : ${session.cfg.model ?? "(default)"}`,
          `effort   : ${effort ?? (PROVIDER_EFFORT_LEVELS[provName].length > 0 ? "(default)" : "unsupported")}`,
          `keys     : ${configured.length === 0 ? "none" : configured.join(", ")}`,
          formatIndexStatusLine(codegraphStatus),
        ].join("\n"),
      );
      return true;
    }

    if (cmd === "effort") {
      await (async () => {
        const provName = session.provider.name as ProviderName;
        const levels = PROVIDER_EFFORT_LEVELS[provName];
        if (levels.length === 0) {
          sysMsg(tui, `reasoning effort isn't supported for ${provName}`);
          return;
        }
        let level = parts[1] as EffortLevel | undefined;
        if (level && !levels.includes(level)) {
          sysMsg(tui, `${provName} supports: ${levels.join(", ")}`);
          return;
        }
        if (!level) {
          const picked = await tui.pickFromList("effort", levels);
          if (!picked) return;
          level = picked as EffortLevel;
        }
        session.cfg = {
          ...session.cfg,
          providerConfig: {
            ...session.cfg.providerConfig,
            [provName]: { ...session.cfg.providerConfig[provName], effort: level },
          },
        };
        session.provider = createProvider(provName, await resolveProviderConfig(session.cfg));
        saveConfig({ provider: provName, effort: level });
        tui.setEffort(level);
        sysMsg(tui, `effort → ${level}`);
      })();
      return true;
    }

    if (cmd === "model") {
      await (async () => {
        const provName = session.provider.name as ProviderName;
        let modelId = parts[1];
        if (!modelId) {
          const picked = await tui.pickFromList(`model (${provName})`, MODEL_CATALOG[provName]);
          if (!picked) return;
          modelId = picked;
        }
        session.cfg = {
          ...session.cfg,
          model: modelId,
          providerConfig: {
            ...session.cfg.providerConfig,
            [provName]: { ...session.cfg.providerConfig[provName], model: modelId },
          },
        };
        session.provider = createProvider(provName, await resolveProviderConfig(session.cfg));
        tui.setContextLimit(session.provider.contextLimit);
        saveConfig({ provider: provName, model: modelId });
        tui.setModel(modelId);
        sysMsg(tui, `model → ${modelId}`);
      })();
      return true;
    }

    if (cmd === "provider") {
      await (async () => {
        let pName = parts[1] as ProviderName | undefined;
        if (!pName) {
          const options = PROVIDER_META.map((p) => ({
            label: `${p.label}${p.needsKey ? (getApiKey(p.id) || getOAuthCredential(p.id) ? " ✓" : " — needs key") : ""}`,
            value: p.id,
          }));
          const picked = await tui.pickFromList("provider", options);
          if (!picked) return;
          pName = picked as ProviderName;
        }

        const meta = getProviderMeta(pName);
        if (meta.needsKey && !getApiKey(pName) && !getOAuthCredential(pName)) {
          const key = await tui.promptForText(`${meta.label} — API key`, { mask: true });
          if (!key) {
            sysMsg(tui, "provider switch cancelled");
            return;
          }
          setApiKey(pName, key);
          session.cfg = {
            ...session.cfg,
            providerConfig: {
              ...session.cfg.providerConfig,
              [pName]: { ...session.cfg.providerConfig[pName], apiKey: key },
            },
          };
        }

        try {
          session.provider = createProvider(pName, await resolveProviderConfig(session.cfg));
          tui.setContextLimit(session.provider.contextLimit);
          session.cfg = { ...session.cfg, provider: pName };
          saveConfig({ provider: pName });
          tui.setModel(session.provider.model);
          tui.setEffort(currentEffort(pName));
          sysMsg(tui, `provider → ${pName}`);
        } catch (err) {
          sysMsg(tui, err instanceof Error ? err.message : `failed to switch to ${pName}`);
        }
      })();
      return true;
    }

    if (cmd === "login") {
      await (async () => {
        const providerId = parts[1];
        let target = providerId ? LOGIN_TARGETS.find((t) => t.provider === providerId) : undefined;
        if (!target) {
          const picked = await tui.pickFromList(
            "sign in via subscription",
            LOGIN_TARGETS.map((t) => ({ label: t.label, value: t.provider })),
          );
          if (!picked) return;
          target = LOGIN_TARGETS.find((t) => t.provider === picked);
        }
        if (!target) {
          sysMsg(tui, `unknown login target: ${providerId}`);
          return;
        }

        try {
          const cred = await target.login(tuiLoginUI(tui));
          setOAuthCredential(target.provider, cred);
          sysMsg(tui, `signed in to ${target.label}. Switching provider...`);
          session.provider = createProvider(
            target.provider as ProviderName,
            await resolveProviderConfig(session.cfg),
          );
          tui.setContextLimit(session.provider.contextLimit);
          session.cfg = { ...session.cfg, provider: target.provider as ProviderName };
          saveConfig({ provider: target.provider as ProviderName });
          tui.setModel(session.provider.model);
          sysMsg(tui, `provider → ${target.provider}`);
        } catch (err) {
          sysMsg(tui, `login failed: ${err instanceof Error ? err.message : String(err)}`);
        }
      })();
      return true;
    }

    if (cmd === "mcp") {
      await (async () => {
        const entries = mcpPickerEntries(cwd);
        if (entries.length === 0) {
          sysMsg(
            tui,
            'no MCP servers configured. Run: athena mcp add <name> --local "<cmd>" | --remote <url>',
          );
          return;
        }
        await tui.pickFromList("mcp servers", entries.map(formatMcpPickerOption), {
          onToggle: (name) => {
            mcpToggle(name, cwd);
            return mcpPickerEntries(cwd).map(formatMcpPickerOption);
          },
        });
      })();
      return true;
    }

    if (cmd === "skills") {
      if (skills.length === 0) {
        sysMsg(
          tui,
          [
            "no skills loaded. Athena also reads skills written for Claude — add a SKILL.md under any of:",
            `  ~/.claude/skills/<name>/       or  ${join(cwd, ".claude", "skills", "<name>")}`,
            `  ${join(agentDir(), "skills", "<name>")}  or  ${join(cwd, ".athena", "skills", "<name>")}`,
            "then run /reload. Use /context-config to turn a source on or off.",
          ].join("\n"),
        );
        return true;
      }
      await (async () => {
        const options: PickerOption[] = skills.map((s) => ({
          label: s.name,
          value: s.name,
          hint: `${s.scope} · ${s.source}${s.disableModelInvocation ? " · manual-only" : ""}`,
          tone: s.disableModelInvocation ? "muted" : "success",
        }));
        const picked = await tui.pickFromList(`Skills — ${skills.length} loaded`, options);
        if (!picked) return;
        const skill = skills.find((s) => s.name === picked);
        if (!skill) return;
        sysMsg(
          tui,
          `**${skill.name}** \`${skill.source} · ${skill.scope}\`${skill.disableModelInvocation ? " · manual-only" : ""}\n${skill.description}\n\`${skill.filePath}\``,
        );
      })();
      return true;
    }

    if (cmd === "context-config") {
      await (async () => {
        const rows = ["claudeMd", "claudeSkills"] as const;
        const labels: Record<(typeof rows)[number], string> = {
          claudeMd: "CLAUDE.md",
          claudeSkills: "claude skills",
        };
        const buildOptions = (): PickerOption[] =>
          rows.map((key) => ({
            label: labels[key],
            value: key,
            hint: contextSources[key] ? "✓ enabled" : "○ disabled",
            tone: contextSources[key] ? "success" : "muted",
          }));

        await tui.pickFromList(
          "context sources — space to toggle (athena's own skills are always on)",
          buildOptions(),
          {
            onToggle: (name) => {
              const key = name as (typeof rows)[number];
              contextSources = { ...contextSources, [key]: !contextSources[key] };
              saveContextSourcesConfig({ [key]: contextSources[key] });
              skills = loadSkills({
                cwd,
                agentDir: agentDir(),
                enabledSources: { claude: contextSources.claudeSkills },
              });
              tui.setCustomCommands(buildCustomCommandList());
              return buildOptions();
            },
          },
        );
        sysMsg(
          tui,
          `context sources → CLAUDE.md: ${contextSources.claudeMd ? "on" : "off"}, claude skills: ${contextSources.claudeSkills ? "on" : "off"} — ${skills.length} skill(s) loaded`,
        );
      })();
      return true;
    }

    if (cmd === "init") {
      const existing = existsSync(join(cwd, "CLAUDE.md"));
      const instruction = existing
        ? "Read the existing CLAUDE.md at the repo root, then update it: explore the current codebase (stack, structure, build/test/lint commands, conventions) and merge any new or changed information in, keeping what's still accurate. Write the result back to CLAUDE.md with write_file."
        : "Explore this repo (stack, structure, build/test/lint commands, conventions) and write a new CLAUDE.md at the repo root with write_file, following the style of a typical project-instructions file for an AI coding agent: concise, factual, organized by section.";
      await processOneMessage(instruction, tui);
      return true;
    }

    if (cmd === "reload") {
      skills = loadSkills({
        cwd,
        agentDir: agentDir(),
        enabledSources: { claude: contextSources.claudeSkills },
      });
      commandTemplates = loadCommandTemplates({ cwd, agentDir: agentDir() });
      tui.setCustomCommands(buildCustomCommandList());
      sysMsg(tui, `reloaded: ${skills.length} skill(s), ${commandTemplates.length} command(s)`);
      return true;
    }

    const customTemplate = commandTemplates.find((t) => t.name === cmd);
    if (customTemplate) {
      const expanded = expandPromptTemplate(text, commandTemplates);
      await processOneMessage(expanded, tui);
      return true;
    }

    const invokedSkill = skills.find((s) => skillCommandName(s) === cmd);
    if (invokedSkill) {
      const rest = text.slice(1 + skillCommandName(invokedSkill).length).trim();
      const instruction = [
        `Read the skill file at ${invokedSkill.filePath} and follow its instructions now.`,
        rest ? `Additional context from the user: ${rest}` : "",
      ]
        .filter(Boolean)
        .join("\n");
      await processOneMessage(instruction, tui);
      return true;
    }

    sysMsg(tui, `unknown command: /${cmd}. Type /help for a list.`);
    return true;
  }

  const processOneMessage = async (msg: string, tui: TuiCallbacks): Promise<void> => {
    if (msg.startsWith("/")) {
      await handleSlashCommand(msg, tui);
      return;
    }

    // The user's own turn was never pushed to the live TUI transcript — only the assistant
    // side goes through `createCallbacks()`. Under the old alt-screen renderer this was masked
    // (the editor's pre-submit text got overwritten every frame regardless); under native
    // scrollback (TuiMainScreen) that pre-submit text becomes permanent, uncolored scrollback
    // instead of a real, styled UserMessageComponent bubble. Add it explicitly.
    tui.addMessage({ id: crypto.randomUUID(), role: "user", content: msg });

    const adapterState: AdapterState = {
      currentToolCallId: null,
      streamingMessageId: null,
      streamingContent: "",
      lastInputTokens: 0,
      lastOutputTokens: 0,
      lastCacheReadTokens: 0,
      lastCacheWriteTokens: 0,
    };
    const requestPermission = async (toolName: string, input: unknown): Promise<boolean> => {
      const scope = permissionScope(toolName, input);
      if (alwaysAllowed.has(scope.key)) return true;
      const summary = JSON.stringify(input).slice(0, 200);
      const choice = await tui.pickFromList(`Allow ${toolName}? ${summary}`, [
        "Allow",
        { label: `Yes, and don't ask again for: ${scope.label}`, value: "always-allow" },
        "Deny",
      ]);
      if (choice === "always-allow") {
        alwaysAllowed.add(scope.key);
        saveAlwaysAllow(scope.key);
        return true;
      }
      return choice === "Allow";
    };
    const callbacks = createCallbacks(tui, adapterState, requestPermission);

    const priorHistory = history;
    const turnStartedAt = Date.now();
    const abortController = new AbortController();
    currentTurnAbort = abortController;
    let agentSession;
    try {
      const turnEffort = currentEffort(session.provider.name as ProviderName);
      agentSession = await runAgent(msg, {
        provider: session.provider,
        tools,
        cwd,
        callbacks,
        sessionHistory: history,
        signal: abortController.signal,
        skills,
        includeClaudeMd: contextSources.claudeMd,
        ...(turnEffort !== undefined ? { effort: turnEffort } : {}),
      });
    } catch (err) {
      currentTurnAbort = null;
      finalizeStream(tui, adapterState);
      sysMsg(tui, `error: ${err instanceof Error ? err.message : String(err)}`);
      return;
    }
    const wasAborted = abortController.signal.aborted;
    currentTurnAbort = null;

    history = agentSession.messages;
    for (const newMsg of diffNewMessages(priorHistory, history)) {
      sessionManager.appendMessage(newMsg);
    }

    finalizeStream(tui, adapterState);
    if (agentSession.tokenUsage.costUsd !== undefined) {
      tui.addCost(agentSession.tokenUsage.costUsd);
    }
    if (wasAborted) {
      sysMsg(tui, "cancelled (ctrl+c) — partial turn saved");
    } else {
      const elapsedS = Math.round((Date.now() - turnStartedAt) / 1000);
      tui.addMessage({
        id: crypto.randomUUID(),
        role: "timing",
        content: `Crunched for ${elapsedS}s`,
      });
    }
  };

  const handleUserMessage = async (msg: string, tui: TuiCallbacks): Promise<void> => {
    if (turnInFlight) {
      messageQueue.push(msg);
      tui.setQueuedMessages([...messageQueue]);
      return;
    }

    turnInFlight = true;
    try {
      await processOneMessage(msg, tui);
      while (messageQueue.length > 0) {
        const next = messageQueue.shift()!;
        tui.setQueuedMessages([...messageQueue]);
        await processOneMessage(next, tui);
      }
    } finally {
      turnInFlight = false;
      tui.setStatus({ kind: "ready" });
    }
  };

  const recallLastQueued = (): void => {
    messageQueue.pop();
    liveTui?.setQueuedMessages([...messageQueue]);
  };

  const app = new TuiApp({
    initialState: {
      model: session.provider.model,
      ...(currentEffort(session.provider.name as ProviderName) !== undefined
        ? { effort: currentEffort(session.provider.name as ProviderName) }
        : {}),
      cwd,
      contextLimit: session.provider.contextLimit,
      messages: agentMessagesToTuiMessages(history),
      customCommands: buildCustomCommandList(),
    },
    onUserMessage: handleUserMessage,
    onRecallQueued: recallLastQueued,
    onCtrlC: handleSigint,
    onReady: (callbacks: TuiCallbacks) => {
      liveTui = callbacks;
    },
  });
  unmountApp = () => app.stop();

  await app.start();
  await shutdown();
}

main().catch(async (e: unknown) => {
  console.error(e);
  await shutdownTelemetry();
  process.exit(1);
});
