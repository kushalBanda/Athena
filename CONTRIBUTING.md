# Contributing to Athena

We want to make it easy for you to contribute to Athena. Here are the most common type of changes that get merged:

- Bug fixes
- Support for new providers or APIs
- Improvements to agent-loop reliability or performance
- New extensions, tools, or skills
- Fixes for environment-specific quirks
- Documentation improvements

However, any TUI or core agent-loop architecture change must go through a design review with a maintainer before implementation.

If you are unsure if a PR would be accepted, feel free to ask a maintainer or look for issues with any of the following labels:

- `help wanted`
- `good first issue`
- `bug`

> [!NOTE]
> PRs that ignore these guardrails will likely be closed.

Want to take on an issue? Leave a comment and a maintainer may assign it to you unless it is something we are already working on.

## Developing Athena

- Requirements: Node.js >= 22.19.0, npm
- Install dependencies and build from the repo root:

  ```bash
  npm install --include=dev
  npm run build
  ```

- To build without network access (skips model-data fetch):

  ```bash
  npm run build:offline
  ```

### Repository layout

- `packages/ai`: Provider abstraction (Model/Api, streaming, cost/usage, retry)
- `packages/agent`: Core agent-loop, harness, session, compaction (no I/O, no TUI)
- `packages/tui`: Terminal render engine
- `packages/client` / `packages/protocol`: Transport-neutral client + CBOR protocol for remote sessions
- `packages/session-backends/sqlite-node`: SQLite-backed durable session storage
- `packages/coding-agent`: CLI app — tools, extensions, slash commands, interactive TUI, SDK
- `packages/telemetry`: Vendor-neutral telemetry contracts and conformance tests

See the root [CLAUDE.md](CLAUDE.md) and each package's own `CLAUDE.md` for architecture details.

### Running the CLI in development

```bash
npm --prefix packages/coding-agent run dev
```

### Lint, format, and type-check

```bash
npm run check
```

### Running tests

```bash
npm test                                  # all workspaces
npm --prefix packages/<name> test         # single package
```

Tests run with `ATHENA_OFFLINE=1` and `ATHENA_MCP_TEST_DISCOVERY_DISABLED=1` by default — no API keys or live servers needed.

## Pull Request Expectations

### Issue First Policy

**All non-trivial PRs must reference an existing issue.** Before opening a PR, open an issue describing the bug or feature. This helps maintainers triage and prevents duplicate work.

- Use `Fixes #123` or `Closes #123` in your PR description to link the issue
- For small fixes (typos, docs), a linked issue is not required

### General Requirements

- Keep pull requests small and focused
- Explain the issue and why your change fixes it
- Before adding new functionality, check it doesn't already exist elsewhere in the codebase
- Run `npm run check` and relevant tests before opening the PR

### TUI / UI Changes

If your PR changes terminal UI rendering or layout, include a screenshot or terminal recording showing before/after.

### Logic Changes

For non-UI changes (bug fixes, new features, refactors), explain **how you verified it works**:

- What did you test?
- How can a reviewer reproduce/confirm the fix?

### No AI-Generated Walls of Text

Long, AI-generated PR descriptions and issues are not acceptable and may be ignored. Respect the maintainers' time:

- Write short, focused descriptions
- Explain what changed and why in your own words
- If you can't explain it briefly, your PR might be too large

### PR Titles

PR titles should follow conventional commit standards:

- `feat:` new feature or functionality
- `fix:` bug fix
- `docs:` documentation or README changes
- `chore:` maintenance tasks, dependency updates, etc.
- `refactor:` code refactoring without changing behavior
- `test:` adding or updating tests

You can optionally include a scope to indicate which package is affected, e.g. `feat(agent):`, `fix(tui):`, `chore(coding-agent):`.

### Style Preferences

- Follow the conventions in the root [CLAUDE.md](CLAUDE.md) and the relevant package `CLAUDE.md`.
- ESM throughout; `.ts` extensions required on relative imports.
- No TypeScript enums — use union types or `as const` objects.
- Biome formatting: tab indentation (width 3), line width 120.
- Keep `packages/agent` and `packages/ai` free of I/O, TUI imports, and session-backend imports.

## Feature Requests

For net-new functionality, start with a design conversation. Open an issue describing the problem, your proposed approach (optional), and why it belongs in Athena. Please wait for maintainer feedback before opening a feature PR.

## Issue Requirements

All issues should use one of the issue templates:

- **Bug report** — for reporting bugs
- **Feature request** — for suggesting enhancements

Issues may be flagged for missing required fields, placeholder text, or AI-generated walls of text.
