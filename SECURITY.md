# Security

## IMPORTANT

We do not accept AI-generated security reports. We receive a large number of
these and do not have the resources to review them all. Submitting one may
result in a ban from the project.

## Threat Model

### Overview

Athena is an AI-powered coding agent that runs locally on your machine. It
provides an agent loop with access to powerful tools including shell
execution, file operations, and network access.

### No Sandbox

Athena does **not** sandbox the agent by default. It runs with the
permissions of the user and process that launched it. See
[packages/coding-agent/docs/containerization.md](packages/coding-agent/docs/containerization.md)
for supported isolation patterns (Gondolin extension, plain Docker, OpenShell).

If you need true isolation, run Athena inside a container or VM.

### RPC / Remote Sessions

Athena's RPC mode is opt-in and intended for local process integration over a
framed byte protocol. It is the integrator's responsibility to control which
processes can connect to an RPC session; exposing it over a network without
authentication is not a supported configuration.

### Out of Scope

| Category                        | Rationale                                                               |
| -------------------------------- | ----------------------------------------------------------------------- |
| **Damage from unrestricted tool use** | The permission-less default is documented behavior; use containerization for isolation |
| **LLM provider data handling**  | Data sent to your configured LLM provider is governed by their policies |
| **MCP server behavior**         | External MCP servers you configure are outside our trust boundary       |
| **Malicious config/extension files** | Users control their own config and extensions; a user running their own malicious extension is not a vulnerability |

---

# Reporting Security Issues

We appreciate your efforts to responsibly disclose your findings, and will
make every effort to acknowledge your contributions.

To report a security issue, please use the GitHub Security Advisory
["Report a Vulnerability"](https://github.com/kushalBanda/Athena/security/advisories/new) tab.

The maintainer will send a response indicating next steps in handling your
report, and will keep you informed of progress towards a fix and disclosure.
