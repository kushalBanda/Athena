#!/usr/bin/env bun
import React from "react";
import { render } from "ink";
import { runAgent } from "@athena/agent-core";
import type { ActiveToolCall } from "@athena/agent-core";
import { createDefaultRegistry } from "@athena/tools";
import { createProvider } from "@athena/providers";
import type { ProviderName } from "@athena/providers";
import { App } from "@athena/tui";
import type { AgentCallbacks as TuiCallbacks } from "@athena/tui";
import { loadConfig, saveConfig } from "./config.js";
import { createCallbacks, finalizeStream } from "./adapter.js";
import type { AdapterState } from "./adapter.js";
import { setApiKey, getApiKey, listKeys, getConfiguredProviders, autoDetectProvider } from "./auth.js";
import { runSetup } from "./setup.js";
import type { SetupResult } from "./setup.js";
import { MODEL_CATALOG, PROVIDER_CATALOG } from "./models.js";

interface CliArgs {
  print: boolean;
  message: string | null;
  provider: string | null;
  model: string | null;
  subcommand: string | null;
}

function parseArgs(argv: string[]): CliArgs {
  const args = argv.slice(2);
  const result: CliArgs = { print: false, message: null, provider: null, model: null, subcommand: null };

  // detect top-level subcommand
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
  athena --provider <name>            override provider: anthropic|ollama|gemini|azure
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
  // priority: CLI flag > config file > auto-detect from stored keys > default
  if (args.provider) return args.provider;
  if (cfg.provider !== "anthropic") return cfg.provider; // explicit in config file
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

  let cfg = loadConfig();
  let providerName = resolveProvider(args, cfg) as Parameters<typeof createProvider>[0];

  // first-run gate: no key configured → inline setup instead of hard exit
  const needsKey = providerName !== "ollama";
  const hasKey = (cfg.providerConfig as Record<string, { apiKey?: string }>)[providerName]?.apiKey;
  if (needsKey && !hasKey) {
    // -p mode: can't show ink UI, hard exit with hint
    if (args.print) {
      console.error(`athena: no API key for "${providerName}". Run: athena auth set ${providerName} <key>`);
      process.exit(1);
    }
    const result: SetupResult = await runSetup();
    if (result.cancelled) process.exit(0);
    // reload config after setup stored the key
    cfg = loadConfig();
    providerName = result.provider as Parameters<typeof createProvider>[0];
  }

  // mutable session state — slash commands can swap provider/model in-session
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
      process.exit(1);
    }

    await runAgent(message, {
      provider: session.provider,
      tools,
      cwd,
      callbacks: {
        onThinking: () => {},
        onAssistantToken: (t: string) => process.stdout.write(t),
        onToolCall: (c: ActiveToolCall) => console.error(`[tool] ${c.name}`),
        onToolResult: (_id: string, result: string, status: "ok" | "err") => {
          if (status === "err") console.error(`[tool-err] ${result}`);
        },
        onCompacting: () => console.error("[compacting]"),
        onTokenUpdate: () => {},
        // -p is non-interactive: no TUI to prompt through, so tools are auto-allowed.
        onPermissionRequest: async () => true,
      },
    });

    process.stdout.write("\n");
    return;
  }

  function sysMsg(tui: TuiCallbacks, content: string) {
    tui.addMessage({ id: crypto.randomUUID(), role: "system", content });
  }

  function handleSlashCommand(text: string, tui: TuiCallbacks): boolean {
    const parts = text.slice(1).trim().split(/\s+/);
    const cmd = parts[0]?.toLowerCase();

    if (cmd === "help") {
      sysMsg(tui, [
        "/model [id]              switch model (opens picker if no id given)",
        "/provider [name]         switch provider (opens picker if no name given)",
        "/key <provider> <key>    store API key in auth.json",
        "/status                  show current provider + model",
        "/clear                   clear chat history",
        "/exit  /quit             quit athena",
      ].join("\n"));
      return true;
    }

    if (cmd === "status") {
      const configured = getConfiguredProviders();
      sysMsg(tui, [
        `provider : ${session.provider.name}`,
        `model    : ${session.cfg.model ?? "(default)"}`,
        `keys     : ${configured.length === 0 ? "none" : configured.join(", ")}`,
      ].join("\n"));
      return true;
    }

    if (cmd === "model") {
      void (async () => {
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
      void (async () => {
        let pName = parts[1] as ProviderName | undefined;
        if (!pName) {
          const picked = await tui.pickFromList("provider", PROVIDER_CATALOG);
          if (!picked) return;
          pName = picked as ProviderName;
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

    if (cmd === "key") {
      const prov = parts[1];
      const key = parts[2];
      if (!prov || !key) { sysMsg(tui, "usage: /key <provider> <api-key>"); return true; }
      setApiKey(prov, key);
      const provKey = prov as keyof typeof session.cfg.providerConfig;
      session.cfg = {
        ...session.cfg,
        providerConfig: {
          ...session.cfg.providerConfig,
          [provKey]: { ...session.cfg.providerConfig[provKey], apiKey: getApiKey(prov) },
        },
      };
      if (prov === session.provider.name) {
        session.provider = createProvider(
          prov as Parameters<typeof createProvider>[0],
          session.cfg.providerConfig,
        );
        tui.setContextLimit(session.provider.contextLimit);
      }
      sysMsg(tui, `saved ${prov} key to auth.json`);
      return true;
    }

    sysMsg(tui, `unknown command: /${cmd}. Type /help for a list.`);
    return true;
  }

  // Interactive TUI
  const handleUserMessage = async (msg: string, tui: TuiCallbacks): Promise<void> => {
    if (msg.startsWith("/")) {
      handleSlashCommand(msg, tui);
      return;
    }

    const adapterState: AdapterState = {
      currentToolCallId: null,
      streamingMessageId: null,
      streamingContent: "",
      lastInputTokens: 0,
      lastOutputTokens: 0,
    };
    const requestPermission = async (toolName: string, input: unknown): Promise<boolean> => {
      const summary = JSON.stringify(input).slice(0, 200);
      const choice = await tui.pickFromList(`Allow ${toolName}? ${summary}`, ["Allow", "Deny"]);
      return choice === "Allow";
    };
    const callbacks = createCallbacks(tui, adapterState, requestPermission);

    const agentSession = await runAgent(msg, { provider: session.provider, tools, cwd, callbacks });

    finalizeStream(tui, adapterState);
    if (agentSession.tokenUsage.costUsd !== undefined) {
      tui.addCost(agentSession.tokenUsage.costUsd);
    }
  };

  const { waitUntilExit } = render(
    React.createElement(App, {
      initialState: { model: session.provider.model, cwd, contextLimit: session.provider.contextLimit },
      onUserMessage: handleUserMessage,
    }),
  );

  await waitUntilExit();
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
