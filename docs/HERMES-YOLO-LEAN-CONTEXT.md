# hermes-yolo lean context (progressive Agent Skills)

Implements [Google for Devs / Genkit progressive Agent Skills](https://developers.googleblog.com/)
pattern: **keep agent context lean without sacrificing expertise**.

Source inspiration: Threads `@googlefordevs` — *Keep your agents' context lean without
sacrificing expertise* (on-demand skill activation).

## Stages

| Stage | What loads | Token cost |
|-------|------------|------------|
| **Discovery** | SKILL.md frontmatter only (`name` + `description`) | ~tens of tokens per skill |
| **Activation** | Full skill body for top description matches (default max 2) | only matched SOPs |
| **Execution** | Agent sees catalog always; full expertise only when matched | avoids full-dump thrash |

## What hermes-yolo does

1. On each one-shot prompt (`hermes-yolo "…"` / `-z` / grok `-p`), builds a lean pack from:
   - `./.claude/skills`, `./.grok/skills`, `./.agents/skills`, `./hermes-skills`
   - `~/.grok/skills`, `~/.claude/skills`, `~/.hermes/skills`
   - Extra roots via `HERMES_YOLO_SKILL_PATHS=a:b`
2. Injects markdown prefix: catalog (metadata) + activated skill bodies.
3. **Progressive toolsets**: default stays slim
   (`terminal,file,web,code_execution,memory,clarify`).
   Adds `vision` / `computer_use` only when the task text needs them (or
   `HERMES_YOLO_TOOLSETS` is set explicitly).
4. Writes receipts:
   - `~/.hermes/receipts/hermes-yolo/lean-context-latest.{md,json}`
   - Route receipt `policy.leanContext` (counts + tokens saved vs full dump)

## CLI

```bash
# Scan catalog only
node tools/hermes-yolo-lean-context.js --scan --json

# Build pack for a task
node tools/hermes-yolo-lean-context.js --task "fix auth pairing" --json
```

## Env

| Variable | Default | Meaning |
|----------|---------|---------|
| `HERMES_YOLO_LEAN_CONTEXT` | on (`1`) | Set `0` to disable entirely |
| `HERMES_YOLO_SKILL_ACTIVATE_MAX` | `2` | Max full skill bodies injected |
| `HERMES_YOLO_LEAN_CONTEXT_MAX_CHARS` | `16000` | Cap on injected prefix |
| `HERMES_YOLO_SKILL_PATHS` | — | Extra skill roots (`:`-separated) |
| `HERMES_YOLO_TOOLSETS` | progressive | Explicit list wins over progressive |
| `HERMES_YOLO_ALLOW_COMPUTER_USE` | unset | Force `computer_use` toolset on |

## Install

`scripts/install-grok-yolo.sh` copies:

- `hermes-yolo-wrapper.js` → `~/.hermes/hermes-yolo-wrapper.js`
- `tools/hermes-yolo-lean-context.js` → `~/.hermes/hermes-yolo-lean-context.js`

The wrapper soft-fails if the lean-context module is missing (routing still works).

## Tests

```bash
node tests/test-hermes-yolo-lean-context.js
node tests/test-hermes-yolo.js
```
