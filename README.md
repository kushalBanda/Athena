<p align="center">
  <b>Athena</b>
</p>
<p align="center">
  <a href="https://www.npmjs.com/package/@kushalbanda/athena"><img alt="npm" src="https://img.shields.io/npm/v/@kushalbanda/athena?style=flat-square" /></a>
</p>

## Athena

Athena is an open-source AI coding agent, rebased on top of the
[pi](https://github.com/earendil-works/pi) agent harness (MIT-licensed) as of 2026-08-14. See
`docs/superpowers/specs/2026-08-14-athena-rebase-design.md` for why, and
`docs/superpowers/plans/2026-08-14-athena-rebase-swap.md` for how. Athena's own
distinctive pieces (CodeGraph integration, `/init`-generated CLAUDE.md,
Claude-skills-source loading) are documented in `docs/IP/` and being
re-ported onto this base incrementally — not all present yet.

## Packages

| Package | Description |
|---------|-------------|
| **[@kushalbanda/telemetry](packages/telemetry)** | Vendor-neutral telemetry contracts, reference adapter, conformance tests, and typed schemas |
| **[@kushalbanda/ai](packages/ai)** | Unified multi-provider LLM API (OpenAI, Anthropic, Google, etc.) |
| **[@kushalbanda/agent-core](packages/agent)** | Agent runtime with tool calling and state management |
| **[@kushalbanda/athena](packages/coding-agent)** | Interactive coding agent CLI (Athena) |
| **[@kushalbanda/tui](packages/tui)** | Terminal UI library with differential rendering |

Packages are published under the `@kushalbanda` scope; the `athena` binary and `.athena` config directory are set via `packages/coding-agent/package.json`'s `athenaConfig`.

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
