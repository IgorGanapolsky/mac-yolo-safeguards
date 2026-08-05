# mac-yolo-safeguards Grok workflows

Project workflows for [Grok Build](https://x.ai/news/workflows). Discovered from `.grok/workflows/*.rhai` (project beats user `~/.grok/workflows/` for same names; built-ins win over both).

## Workflows

| Name | File | Purpose |
|------|------|---------|
| **`mac-yolo-issues-board`** | `mac-yolo-issues-board.rhai` | Open GitHub Issues (#132/#141/#242) + Linear mirrors + open PRs + e2e proof → ranked next actions |
| **`coding-context-loop`** | `coding-context-loop.rhai` | Issue-first coding slice: `coding-context-pack` → AC/PR/three-bus lanes → one next slice + skills |

## Invoke

In Grok Build (repo root or hermes-mobile session on this monorepo):

```text
/mac-yolo-issues-board
/mac-yolo-issues-board {"smoke": true}
/mac-yolo-issues-board {"issue": 132}

/coding-context-loop
/coding-context-loop {"smoke": true}
/coding-context-loop {"issue": 132}
```

CLI SSOT (no workflow budget required):

```bash
node tools/coding-context-pack.js --minimal
node tools/coding-context-pack.js --sync --write
node tools/coding-context-pack.js --ship-check --pr N --agent AGENT-X
```

Progress: `/workflows` · pause/resume/stop: `/workflow pause|resume|stop <display-name>`

## Safety

**Read-only orchestration.** Workflows rank work; they do **not**:

- Linear `--claim` / `--done`
- Merge PRs
- Social publish / Chrome
- Spend money

Main agent executes after the board.

## Complements

| Bus | Role |
|-----|------|
| GitHub Issues | Product board |
| Linear `AGENT-*` | Locks / claims (`[GH-#N]` mirrors) |
| `plan.md` | File ownership |
| Vault `AI-Agent-Sync` | Handoffs |
| `tools/coding-context-pack.js` | Deterministic pack + skill routing + ship gate |
| `/coding-context-pack` skill | Auto-invoke load path |
| `~/.grok/skills/context-engineering-checklist` | HF units 1–5 checklist for new skills/hooks |
| `~/.grok/skills/gsd-ralph-context-loop` | Capture→Execute + promote mistakes to gates |
| `~/.grok/workflows/linear-top10-triage` | Fleet-wide triage |

**Default:** `/coding-context-loop` for "what do I code next"; `/mac-yolo-issues-board` for deep Issues board.
