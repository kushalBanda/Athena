#!/usr/bin/env node
import { DEFAULT_COMPACTION_SETTINGS, SessionManager, compact, diffNewMessages, newId, runAgent } from "@athena/agent-core";
import type { ActiveToolCall, AgentMessage } from "@athena/agent-core";
import { getTracer, initTelemetry, shutdownTelemetry } from "@athena/observability";
import { createProvider } from "@athena/providers";
import type { ProviderName } from "@athena/providers";
import { createDefaultRegistry } from "@athena/tools";
import { App } from "@athena/tui";
import type { AgentCallbacks as TuiCallbacks } from "@athena/tui";
import { SpanKind } from "@opentelemetry/api";
import { render } from "ink";
import React from "react";
import { agentMessagesToTuiMessages, createCallbacks, finalizeStream } from "./adapter.js";
import type { AdapterState } from "./adapter.js";
import {
  autoDetectProvider,
  getApiKey,
  getConfiguredProviders,
  getOtlpHeaders,
  listKeys,
  setApiKey,
} from "./auth.js";
import { loadConfig, loadObservabilityConfig, saveConfig } from "./config.js";
import { MODEL_CATALOG } from "./models.js";
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
  if (first === "auth" || first === "setup" || first === "status") {
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
  athena --provider <name>            override provider: anthropic|ollama|gemini|azure|bedrock
  athena --model <id>                 override model id

  athena setup                        interactive first-run setup (choose provider + key)
  athena status                       show current config and stored keys
  athena auth set <provider> <key>    store API key in ~/.config/athena/auth.json
  athena auth list                    list stored providers
`);
}

function handleAuthCommand(argv: string[]): boolean {
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
  if (action === "list" || action === undefined) {
    listKeys();
    return true;
  }
  console.error(`Unknown auth action: ${action}. Use: athena auth set <provider> <key>`);
  process.exit(1);
}

function handleStatusCommand() {
  const configured = getConfiguredProviders();
  const auto = autoDetectProvider();
  const cfg = loadConfig();

  console.log("athena status\n");
  console.log(`  config file : ~/.config/athena/config.json`);
  console.log(`  auth file   : ~/.config/athena/auth.json`);
  console.log(`  provider    : ${cfg.provider}${auto === cfg.provider ? " (auto-detected)" : ""}`);
  if (cfg.model) console.log(`  model       : ${cfg.model}`);
  console.log("");
  if (configured.length === 0) {
    console.log("  No API keys stored. Run: athena setup");
  } else {
    console.log("  Stored keys:");
    listKeys();
  }
}

function resolveProvider(args: CliArgs, cfg: ReturnType<typeof loadConfig>): string {
  if (args.provider) return args.provider;
  if (cfg.provider !== "anthropic") return cfg.provider;
  const detected = autoDetectProvider();
  return detected ?? cfg.provider;
}

async function main() {
  const args = parseArgs(process.argv);

  if (args.subcommand === "auth") {
    handleAuthCommand(process.argv);
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
  const hasKey = (cfg.providerConfig as Record<string, { apiKey?: string }>)[providerName]?.apiKey;
  if (needsKey && !hasKey) {
    if (args.print) {
      console.error(
        `athena: no API key for "${providerName}". Run: athena auth set ${providerName} <key>`,
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
    provider: createProvider(providerName, cfg.providerConfig),
    cfg,
  };

  const registry = createDefaultRegistry();
  const tools = registry.all();
  const cwd = process.cwd();

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

    const printResult = await runAgent(message, {
      provider: session.provider,
      tools,
      cwd,
      sessionHistory: printHistory,
      signal: printAbort.signal,
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

  function sysMsg(tui: TuiCallbacks, content: string) {
    tui.addMessage({ id: crypto.randomUUID(), role: "system", content });
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
          "/status                  show current provider + model",
          "/clear                   clear chat history, start a new session",
          "/compact                 manually compact the session context",
          "/resume                  pick a previous session to resume",
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
          sysMsg(tui, `compacted: ${result.tokensBefore} tokens → summary + ${result.retainedTail.length} kept messages`);
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
      sysMsg(
        tui,
        [
          `provider : ${session.provider.name}`,
          `model    : ${session.cfg.model ?? "(default)"}`,
          `keys     : ${configured.length === 0 ? "none" : configured.join(", ")}`,
        ].join("\n"),
      );
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
        session.provider = createProvider(provName, session.cfg.providerConfig);
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
            label: `${p.label}${p.needsKey ? (getApiKey(p.id) ? " ✓" : " — needs key") : ""}`,
            value: p.id,
          }));
          const picked = await tui.pickFromList("provider", options);
          if (!picked) return;
          pName = picked as ProviderName;
        }

        const meta = getProviderMeta(pName);
        if (meta.needsKey && !getApiKey(pName)) {
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
          session.provider = createProvider(pName, session.cfg.providerConfig);
          tui.setContextLimit(session.provider.contextLimit);
          session.cfg = { ...session.cfg, provider: pName };
          saveConfig({ provider: pName });
          tui.setModel(session.provider.model);
          sysMsg(tui, `provider → ${pName}`);
        } catch {
          sysMsg(tui, `unknown provider: ${pName}`);
        }
      })();
      return true;
    }

    sysMsg(tui, `unknown command: /${cmd}. Type /help for a list.`);
    return true;
  }

  const handleUserMessage = async (msg: string, tui: TuiCallbacks): Promise<void> => {
    if (msg.startsWith("/")) {
      await handleSlashCommand(msg, tui);
      return;
    }

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
      const summary = JSON.stringify(input).slice(0, 200);
      const choice = await tui.pickFromList(`Allow ${toolName}? ${summary}`, ["Allow", "Deny"]);
      return choice === "Allow";
    };
    const callbacks = createCallbacks(tui, adapterState, requestPermission);

    const priorHistory = history;
    const turnStartedAt = Date.now();
    const abortController = new AbortController();
    currentTurnAbort = abortController;
    let agentSession;
    try {
      agentSession = await runAgent(msg, {
        provider: session.provider,
        tools,
        cwd,
        callbacks,
        sessionHistory: history,
        signal: abortController.signal,
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

  const { waitUntilExit, unmount } = render(
    React.createElement(App, {
      initialState: {
        model: session.provider.model,
        cwd,
        contextLimit: session.provider.contextLimit,
        messages: agentMessagesToTuiMessages(history),
      },
      onUserMessage: handleUserMessage,
      onReady: (callbacks: TuiCallbacks) => {
        liveTui = callbacks;
      },
    }),
  );
  unmountApp = unmount;

  await waitUntilExit();
  await shutdown();
}

main().catch(async (e: unknown) => {
  console.error(e);
  await shutdownTelemetry();
  process.exit(1);
});
