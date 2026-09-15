# Athena Documentation

Athena is a minimal terminal coding harness. It is designed to stay small at the core while being extended through TypeScript extensions, skills, prompt templates, themes, and athena packages.

## Quick start

Install Athena with npm:

```bash
npm install -g --ignore-scripts @kushalbanda/athena
```

`--ignore-scripts` disables dependency lifecycle scripts during install. Athena does not require install scripts for normal npm installs.

On macOS or Linux, you can also use the installer script or Homebrew:

```bash
# curl installer (installs to ~/.athena/bin/athena)
curl -fsSL https://raw.githubusercontent.com/kushalBanda/Athena/main/install.sh | sh

# Homebrew
brew tap kushalBanda/Athena https://github.com/kushalBanda/Athena
brew install athena
```

To uninstall athena itself:

```bash
npm uninstall -g @kushalbanda/athena   # npm install
brew uninstall athena                   # Homebrew install
rm ~/.athena/bin/athena                 # curl installer
```

For pnpm, Yarn, or Bun installs, use the matching global remove command: `pnpm remove -g @kushalbanda/athena`, `yarn global remove @kushalbanda/athena`, or `bun uninstall -g @kushalbanda/athena`.

Then run it in a project directory:

```bash
athena
```

Authenticate with `/login` for subscription providers, or set an API key such as `ANTHROPIC_API_KEY` before starting athena.

For the full first-run flow, see [Quickstart](quickstart.md).

## Start here

- [Quickstart](quickstart.md) - install, authenticate, and run a first session.
- [Using Athena](usage.md) - interactive mode, slash commands, context files, and CLI reference.
- [Providers](providers.md) - subscription and API-key setup for built-in providers.
- [llama.cpp](llama-cpp.md) - run a local router and manage models with `/llama`.
- [Security](security.md) - project trust, sandbox boundaries, and vulnerability reporting.
- [Containerization](containerization.md) - sandbox athena with Gondolin, Docker, or OpenShell.
- [Settings](settings.md) - global and project settings.
- [Keybindings](keybindings.md) - default shortcuts and custom keybindings.
- [Sessions](sessions.md) - session management, branching, and tree navigation.
- [Compaction](compaction.md) - context compaction and branch summarization.

## Customization

- [Extensions](extensions.md) - TypeScript modules for tools, commands, events, and custom UI.
- [Skills](skills.md) - Agent Skills for reusable on-demand capabilities.
- [Prompt templates](prompt-templates.md) - reusable prompts that expand from slash commands.
- [Themes](themes.md) - built-in and custom terminal themes.
- [Athena packages](packages.md) - bundle and share extensions, skills, prompts, and themes.
- [Custom models](models.md) - add model entries for supported provider APIs.
- [Custom providers](custom-provider.md) - implement custom APIs and OAuth flows.

## Programmatic usage

- [SDK](sdk.md) - embed athena in Node.js applications.
- [RPC mode](rpc.md) - integrate over stdin/stdout JSONL.
- [JSON event stream mode](json.md) - print mode with structured events.
- [TUI components](tui.md) - build custom terminal UI for extensions.

## Reference

- [Environment variables](environment-variables.md) - Athena process configuration and session metadata available to bash tools.
- [Session format](session-format.md) - JSONL session file format, entry types, and SessionManager API.

## Platform setup

- [Windows](windows.md)
- [Termux on Android](termux.md)
- [tmux](tmux.md)
- [Terminal setup](terminal-setup.md)
- [Shell aliases](shell-aliases.md)

## Development

- [Development](development.md) - local setup, project structure, and debugging.
