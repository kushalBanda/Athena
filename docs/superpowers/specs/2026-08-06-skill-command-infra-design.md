# Spec 1: Skill & Slash-Command Infrastructure

## Why

Athena has no skill system and no slash-command parser. System prompt is one static string (`packages/agent-core/src/system-prompt.ts`). Two later goals depend on this existing first:
- `/review` as a built-in skill (caveman-review, adapted)
- A category skill library (VoltAgent-inspired), opt-in per project, zero prompt cost until enabled

## Architecture

```
discovery (fs walk) → SkillRegistry → { enabled skills → prompt metadata block, all skills → /name commands }
```

### 1. Skill format

Folder with `SKILL.md`, Anthropic's minimal frontmatter — no license/compatibility/allowed-tools fields, nothing Athena doesn't use yet:

```yaml
---
name: review
description: Terse code review comments — one line per finding, severity-tagged. Use when reviewing a PR or diff.
---
<body: instructions the model follows when skill is active>
```

`name`: lowercase, hyphens, must match parent folder name (matches spec, avoids ambiguity).
`description`: required. Skills without one are skipped with a warning (Pi's behavior).

### 2. Discovery

New `packages/agent-core/src/skills/discovery.ts`:
- Global: `~/.athena/skills/*/SKILL.md`
- Project: `.athena/skills/*/SKILL.md`, walking from cwd up to git root (or fs root if no repo)
- Each match parsed into `{ name, description, path, bodyPath }` — body is NOT read at discovery time (progressive disclosure: only metadata loads eagerly).
- Name collision (same name, different dirs): keep first found (project wins over global, since project is discovered... actually walk order should put project first), warn on the rest.

### 3. Enablement

`.athena/skills.json` at project root:
```json
{ "enabled": ["review", "typescript-pro"] }
```
- Missing file → built-in defaults only (`review` ships enabled by default, hardcoded fallback list).
- Only `enabled` skills' `{name, description}` get serialized into the system prompt's skill block. Everything else discovered-but-disabled is invisible to the model until enabled — this is what keeps a 100+ skill library from bloating the prompt.

### 4. Prompt injection

`buildAthenaSystemPrompt` gains a `skills` block, appended after tools list:
```
# Skills
- review: Terse code review comments — one line per finding, severity-tagged. Use when reviewing a PR or diff.
- ...
```
Model can reach for a skill mid-task; to load full instructions it needs a way to fetch the body — reuse the existing read/file tool against `bodyPath` (no new tool required, same as Pi's approach of "agent uses `read`").

### 5. Slash commands

New `packages/cli/src/commands.ts`:
- Every *discovered* skill (enabled or not) registers as `/name` — explicit invocation bypasses the enablement gate for that one turn (user intent overrides the cost-saving default).
- `/name <args>` → args appended as `User: <args>`, full SKILL.md body injected directly into that turn's context (skip the read-tool round-trip since the user already named it explicitly).
- Parser lives in the CLI input-handling path (wherever `parseArgs`/message submission currently sits in `packages/cli/src/index.ts` — needs a pre-send hook that checks for a leading `/word` before treating input as a normal message).
- Unknown `/foo` → surfaced as a normal error message in TUI, not silently sent to the model as text.

## Data flow

```
user input "/review src/foo.ts"
  → commands.ts detects leading "/review"
  → look up in SkillRegistry (discovered, not just enabled)
  → found: read SKILL.md body, construct turn = body + "\nUser: src/foo.ts"
  → sent to agent-core as if user typed that whole block
  → not found: TUI shows "Unknown command: /review" — nothing sent
```

## Testing

- `discovery.test.ts`: fixture dirs (global+project, collision, missing description, malformed frontmatter) — mirror Pi's own test fixtures already vendored under `docs/resources/pi/.../test/fixtures/skills/`, adapt a subset.
- `commands.test.ts` (cli): `/name args` parsing, unknown command, args-less invocation.
- `system-prompt.test.ts`: enabled-only skills appear in block, disabled discovered skills don't.

## Out of scope (deferred to Spec 2 / Spec 3)

- Prompt tone/style rewrite (Spec 2)
- Actual skill content beyond `/review` (Spec 3)
- Remote skill URLs (opencode's `skills.urls`) — no use case yet
- `allowed-tools`, `compatibility`, `license` frontmatter fields — add if/when needed
