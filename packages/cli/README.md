# @athena/cli

> A terminal-based AI coding agent that runs interactively or non-interactively from your command line, powered by Anthropic, Gemini, Ollama, or Azure.

---

## Features

- 🖥️ **Interactive TUI** — a full terminal UI built with [Ink](https://github.com/vadimdemedes/ink) for a rich chat experience
- ⚡ **Non-interactive mode** — pipe output with `-p "task"` for scripting and CI workflows
- 🔌 **Multi-provider** — supports Anthropic (Claude), Google Gemini, Ollama (local), and Azure OpenAI
- 🔑 **Key management** — securely store and manage API keys via `athena auth`
- 🛠️ **Tool use** — built-in agentic tools (file read/write, shell, diff, and more)
- 🔀 **In-session switching** — swap provider or model on the fly with `/provider` and `/model` slash commands

---

## Installation

```bash
# From the monorepo root
bun install
bun run --cwd packages/cli dev
```

---

## Usage

```bash
# Launch interactive TUI
athena

# Run a one-shot task and print output to stdout
athena -p "Refactor src/index.ts to use async/await"

# Override provider or model for a session
athena --provider gemini --model gemini-1.5-pro
```

---

## First-Run Setup

On first launch, if no API key is configured, Athena will guide you through an interactive setup:

```bash
athena setup
```

---

## Auth & Config

```bash
# Store an API key
athena auth set anthropic sk-...
athena auth set gemini AIza...

# List configured providers
athena auth list

# Show current config, provider, and stored keys
athena status
```

Config is stored at `~/.config/athena/config.json`  
Keys are stored at `~/.config/athena/auth.json`

---

## Slash Commands (TUI)

| Command | Description |
|---|---|
| `/help` | Show all available slash commands |
| `/model [id]` | Switch model (opens picker if no id given) |
| `/provider [name]` | Switch provider (opens picker if no name given) |
| `/key <provider> <key>` | Store an API key without leaving the TUI |
| `/status` | Display current provider, model, and stored keys |
| `/clear` | Clear chat history |
| `/exit` or `/quit` | Quit Athena |

---

## Supported Providers

| Provider | Flag Name | Notes |
|---|---|---|
| Anthropic | `anthropic` | Claude models; requires `ANTHROPIC_API_KEY` or stored key |
| Google Gemini | `gemini` | Requires `GEMINI_API_KEY` or stored key |
| Ollama | `ollama` | Local models; no API key needed |
| Azure OpenAI | `azure` | Requires endpoint, deployment, and API key |

---

## Options

```
athena [options] [message]

Options:
  -p, --print        Non-interactive mode: print response to stdout and exit
  --provider <name>  Override provider: anthropic | gemini | ollama | azure
  --model <id>       Override model ID
  -h, --help         Show help
```

---

## License

MIT
