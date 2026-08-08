<p align="center">Athena — The open source AI coding agent.</p>

---

## Quickstart

### Installing and running Athena

Run the following to install Athena:

```shell
curl -fsSL https://raw.githubusercontent.com/kushalBanda/Athena/main/scripts/install.sh | bash
```

Then simply run `athena` to get started.

<details>
<summary>Building from source (monorepo)</summary>

```shell
bun install
bun run --cwd packages/cli dev
```

</details>

### Using Athena with a provider

Run `athena` and, on first launch, if no API key is configured, Athena will guide you through interactive setup:

```shell
athena setup
```

You can also configure keys directly:

```shell
athena auth set anthropic sk-...
athena auth set gemini AIza...
athena auth list
athena status
```

Config is stored at `~/.config/athena/config.json`, keys at `~/.config/athena/auth.json`.

## Usage

```shell
# Launch interactive TUI
athena

# Run a one-shot task and print output to stdout
athena -p "Refactor src/index.ts to use async/await"

# Override provider or model for a session
athena --provider gemini --model gemini-1.5-pro
```

### Slash commands (TUI)

| Command | Description |
| --- | --- |
| `/help` | Show all available slash commands |
| `/model [id]` | Switch model (opens picker if no id given) |
| `/provider [name]` | Switch provider (opens picker if no name given) |
| `/key <provider> <key>` | Store an API key without leaving the TUI |
| `/status` | Display current provider, model, and stored keys |
| `/clear` | Clear chat history |
| `/exit` or `/quit` | Quit Athena |

### Supported providers

| Provider | Flag name | Notes |
| --- | --- | --- |
| Anthropic | `anthropic` | Claude models; requires `ANTHROPIC_API_KEY` or stored key |
| Google Gemini | `gemini` | Requires `GEMINI_API_KEY` or stored key |
| Ollama | `ollama` | Local models; no API key needed |
| Azure OpenAI | `azure` | Requires endpoint, deployment, and API key |

### Options

```
athena [options] [message]

Options:
  -p, --print        Non-interactive mode: print response to stdout and exit
  --provider <name>  Override provider: anthropic | gemini | ollama | azure
  --model <id>       Override model ID
  -h, --help         Show help
```

This repository is licensed under the MIT License.
