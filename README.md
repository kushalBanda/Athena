



# Athena

Open source AI coding agent. Terminal UI, multi-provider, sandboxed tools, session persistence.

- **[@athena/cli](packages/cli)**: process entrypoint - arg parsing, config/auth, first-run setup
- **[@athena/tui](packages/tui)**: Ink-based terminal UI
- **[@athena/agent-core](packages/agent-core)**: turn loop, compaction, session persistence
- **[@athena/providers](packages/providers)**: per-vendor `LLMProvider` implementations (Anthropic, Gemini, Azure, Ollama, Bedrock)
- **[@athena/tools](packages/tools)**: sandboxed tool implementations (file I/O, shell, web, codegraph)
- **[@athena/observability](packages/observability)**: vendor-neutral OpenTelemetry tracing wrapper



## Install

```shell
curl -fsSL https://raw.githubusercontent.com/kushalBanda/Athena/main/scripts/install.sh | bash
```

```shell
npm install -g @kushalbanda/athena-cli
# or run without installing
npx @kushalbanda/athena-cli
```

```shell
brew tap kushalBanda/athena https://github.com/kushalBanda/Athena
brew install athena
```

Then run `athena` to get started.

## Quickstart

On first launch, if no API key is configured, Athena walks you through setup:

```shell
athena setup
```

Config lives at `~/.config/athena/config.json`, keys at `~/.config/athena/auth.json`.

## Usage

```shell
# Launch interactive TUI
athena

# Run a one-shot task and print output to stdout
athena -p "Refactor src/index.ts to use async/await"

# Override provider or model for a session
athena --provider anthropic --model claude-sonnet-5
```

```
athena [options] [message]

Options:
  -p, --print        Non-interactive mode: print response to stdout and exit
  --provider <name>  Override provider: anthropic | gemini | ollama | azure | bedrock
  --model <id>       Override model ID
  --continue, -c     Resume the latest session for this directory
  --resume <id>      Resume a specific session by id
  -h, --help         Show help
```



## Slash commands (TUI)


| Command                 | Description                                      |
| ----------------------- | ------------------------------------------------ |
| `/help`                 | Show all available slash commands                |
| `/model [id]`           | Switch model (opens picker if no id given)       |
| `/provider [name]`      | Switch provider (opens picker if no name given)  |
| `/key <provider> <key>` | Store an API key without leaving the TUI         |
| `/status`               | Display current provider, model, and stored keys |
| `/clear`                | Clear chat history                               |
| `/skills`               | List available skills                            |
| `/context-config`       | Toggle context sources (CLAUDE.md, skills, etc.) |
| `/mcp`                  | Manage MCP servers                               |
| `/resume`               | Resume a previous session                        |
| `/reload`               | Reload config                                    |
| `/exit` or `/quit`      | Quit Athena                                      |




## Supported providers


| Provider         | Flag name   | Notes                                            |
| ---------------- | ----------- | ------------------------------------------------ |
| Anthropic        | `anthropic` | Claude models; `ANTHROPIC_API_KEY` or stored key |
| Google Gemini    | `gemini`    | `GEMINI_API_KEY` or stored key                   |
| Ollama           | `ollama`    | Local models; no API key needed                  |
| Azure AI Foundry | `azure`     | Requires endpoint, deployment, and API key       |
| AWS Bedrock      | `bedrock`   | Requires Bedrock config block                    |




## MCP support

```shell
athena mcp add <name> --local "<cmd>" | --remote <url> [--project]
athena mcp list
athena mcp remove <name>
```



## Development

```bash
bun install                          # install all workspace deps
bun run build                        # build all packages
bun run dev                          # run CLI from source
bun run check                        # lint with Biome
bun test                             # run tests
```

## Building standalone binaries

Compiles `packages/cli` into standalone `bun --compile` binaries for macOS and Linux (arm64 + x64), matching what's attached to each [GitHub release](https://github.com/kushalBanda/Athena/releases).

## License

MIT