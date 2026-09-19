## Athena

<p align="center">
  <img src="assets/logo.png" alt="Athena logo" width="160" />
</p>

<p align="center">
  <a href="https://github.com/kushalBanda/Athena/actions/workflows/ci.yml"><img src="https://github.com/kushalBanda/Athena/actions/workflows/ci.yml/badge.svg" alt="CI status" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="MIT License" /></a>
</p>

Athena knows how your code connects, not just what your files contain.

Athena is an open-source, codebase-intelligent coding agent. Built-in CodeGraph integration gives Athena structural context across symbols, dependencies, call paths, and blast radius. Live web search adds current external knowledge. A gated development workflow turns substantial changes into explicit product, architecture, program-design, and vertical-slice decisions before large diffs exist.

Run Athena interactively in the terminal, automate it through print or JSON mode, drive it over RPC, or embed it through the SDK. TypeScript extensions, Agent Skills, prompt templates, themes, and shareable Athena packages let teams shape the agent around their own engineering system.

## Why Athena

- **Codebase intelligence** : CodeGraph is discovered automatically and exposed through MCP when available, giving the agent structural repository context beyond text search.
- **Current knowledge** : Built-in web search lets Athena research recent releases, documentation, and facts outside its model cutoff.
- **Structured delivery** : Substantial development work passes through Product, Architecture, Program Design, and Vertical Slice gates. Small fixes keep a fast path.
- **Workflow ownership** : Replace or extend tools, providers, commands, UI, compaction, permissions, and sandboxing without forking Athena.
- **Model freedom** : Use provider subscriptions, API keys, custom providers, OpenAI-compatible endpoints, or local llama.cpp models.
- **Durable work** : Navigate branching session history, steer active runs, queue follow-ups, compact long sessions, and resume across interfaces.

## Development Workflow

For substantial features, Athena makes important decisions while they are cheap to change:

1. **Product** : Define the user problem, measurable success, and intended experience.
2. **Architecture** : Inspect the current system, map dependencies and blast radius, and design the end-to-end flow.
3. **Program Design** : Agree on files, types, signatures, call paths, tests, and uncertain decisions.
4. **Vertical Slices** : Ship a working tracer bullet, then add one verified capability at a time.

Gate state lives in `docs/plans/<feature>/`, so decisions survive compaction and fresh sessions. Narrow fixes, copy changes, small configuration edits, and throwaway prototypes skip the workflow.

## Install

```bash
npm install -g @kushalbanda/athena
```

Run `athena` to get started.

## Packages

| Package | Description |
|---------|-------------|
| **[athena](packages/coding-agent)** | Interactive coding agent CLI |
| **[ai](packages/ai)** | Unified multi-provider LLM API (OpenAI, Anthropic, Google, etc.) |
| **[agent-core](packages/agent)** | Agent runtime with tool calling and state management |
| **[tui](packages/tui)** | Terminal UI library with differential rendering |
| **[telemetry](packages/telemetry)** | Vendor-neutral telemetry contracts, reference adapter, conformance tests, and typed schemas |

All packages publish under the `@kushalbanda` npm scope.

## Permissions & Containerization

Athena does not include a built-in permission system for restricting filesystem, process, network, or credential access. By default, it runs with the permissions of the user and process that launched it.

If you need stronger boundaries, containerize or sandbox Athena. See [packages/coding-agent/docs/containerization.md](packages/coding-agent/docs/containerization.md) for three patterns:

- **Gondolin extension**: keep `athena` and provider auth on the host while routing built-in tools and `!` commands into a local Linux micro-VM.
- **Plain Docker**: run the whole `athena` process in a local container for simple isolation.
- **OpenShell**: run the whole `athena` process in a policy-controlled sandbox.



## Development

```bash
npm install --include=dev   # Install all dependencies, including dev tooling
npm run build                # Refresh model data, then build all packages
npm run build:offline        # Rebuild using existing model data without network access
npm run check                # Lint, format, and type check
npm run test                 # Run tests across all workspaces
```



## Contributing

Contributions are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for dev setup and PR guidelines, and our [Code of Conduct](CODE_OF_CONDUCT.md).

Found a security issue? See [SECURITY.md](SECURITY.md) for how to report it.

## License

MIT — see [LICENSE](LICENSE).
