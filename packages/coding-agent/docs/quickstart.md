# Quickstart

This page gets you from install to a useful first athena session.

## Install

Athena is distributed as an npm package:

```bash
npm install -g --ignore-scripts @kushalbanda/athena
```

`--ignore-scripts` disables dependency lifecycle scripts during install. Athena does not require install scripts for normal npm installs.

On macOS or Linux, you can also use the installer script (installs to `~/.athena/bin/athena`) or Homebrew:

```bash
curl -fsSL https://raw.githubusercontent.com/kushalBanda/Athena/main/install.sh | sh
```

```bash
brew tap kushalBanda/Athena https://github.com/kushalBanda/Athena
brew install athena
```

### Uninstall

Use the method that installed athena:

```bash
# npm install -g
npm uninstall -g @kushalbanda/athena

# pnpm
pnpm remove -g @kushalbanda/athena

# Yarn
yarn global remove @kushalbanda/athena

# Bun
bun uninstall -g @kushalbanda/athena

# Homebrew
brew uninstall athena

# curl installer
rm ~/.athena/bin/athena
```

Uninstalling athena leaves settings, credentials, sessions, and installed athena packages in `~/.athena/agent/`.

Then start athena in the project directory you want it to work on:

```bash
cd /path/to/project
athena
```

## Authenticate

Athena can use subscription providers through `/login`, or API-key providers through environment variables or the auth file.

### Option 1: subscription login

Start athena and run:

```text
/login
```

Then select a provider. Built-in subscription logins include Claude Pro/Max, ChatGPT Plus/Pro (Codex), and GitHub Copilot.

### Option 2: API key

Set an API key before launching athena:

```bash
export ANTHROPIC_API_KEY=sk-ant-...
athena
```

You can also run `/login` and select an API-key provider to store the key in `~/.athena/agent/auth.json`.

See [Providers](providers.md) for all supported providers, environment variables, and cloud-provider setup.

## First session

Once athena starts, type a request and press Enter:

```text
Summarize this repository and tell me how to run its checks.
```

By default, athena gives the model four tools:

- `read` - read files
- `write` - create or overwrite files
- `edit` - patch files
- `bash` - run shell commands

Additional built-in read-only tools (`grep`, `find`, `ls`) are available through tool options. Athena runs in your current working directory and can modify files there. Use git or another checkpointing workflow if you want easy rollback.

## Give athena project instructions

Athena loads context files at startup. Add an `AGENTS.md` file to tell it how to work in a project:

```markdown
# Project Instructions

- Run `npm run check` after code changes.
- Do not run production migrations locally.
- Keep responses concise.
```

Athena loads:

- `~/.athena/agent/AGENTS.md` for global instructions
- `AGENTS.md` or `CLAUDE.md` from parent directories and the current directory

If a directory contains `AGENTS.override.md`, Athena loads it instead of `AGENTS.md` or `CLAUDE.md` from that directory.

Restart athena, or run `/reload`, after changing context files.

## Common things to try

### Reference files

Type `@` in the editor to fuzzy-search files, or pass files on the command line:

```bash
athena @README.md "Summarize this"
athena @src/app.ts @src/app.test.ts "Review these together"
```

Images or text can be pasted with Ctrl+V (Alt+V on Windows); images can also be dragged into supported terminals.

### Run shell commands

In interactive mode:

```text
!npm run lint
```

The command output is sent to the model. Use `!!command` to run a command without adding its output to the model context.

### Switch models

Use `/model` or Ctrl+L to choose a model. Use Shift+Tab to cycle thinking level. Use Ctrl+P / Shift+Ctrl+P to cycle through scoped models.

### Continue later

Sessions are saved automatically:

```bash
athena -c                  # Continue most recent session
athena -r                  # Browse previous sessions
athena --name "my task"    # Set session display name at startup
athena --session <path|id> # Open a specific session
```

Inside athena, use `/resume`, `/clear`, `/tree`, `/fork`, and `/clone` to manage sessions.

### Non-interactive mode

For one-shot prompts:

```bash
athena -p "Summarize this codebase"
cat README.md | athena -p "Summarize this text"
athena -p @screenshot.png "What's in this image?"
```

Use `--mode json` for JSON event output or `--mode rpc` for process integration.

## Next steps

- [Using Athena](usage.md) - interactive mode, slash commands, sessions, context files, and CLI reference.
- [Providers](providers.md) - authentication and model setup.
- [Settings](settings.md) - global and project configuration.
- [Keybindings](keybindings.md) - shortcuts and customization.
- [Athena Packages](packages.md) - install shared extensions, skills, prompts, and themes.

Platform notes: [Windows](windows.md), [Termux](termux.md), [tmux](tmux.md), [Terminal setup](terminal-setup.md), [Shell aliases](shell-aliases.md).
