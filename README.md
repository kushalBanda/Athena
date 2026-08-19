## Athena

Athena is an open-source AI coding agent for the terminal. It runs interactively, in print/JSON mode, over RPC for process integration, or embedded via SDK, and is extensible through TypeScript extensions, skills, prompt templates, and themes.

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



## License

MIT