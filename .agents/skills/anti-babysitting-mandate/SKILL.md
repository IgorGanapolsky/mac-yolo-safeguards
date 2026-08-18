---
name: anti-babysitting-mandate
description: >
  HARD: never park waiting for "continue" or "want me to?" on pre-authorized
  repo/machine work. Residual picker + wrap-up lint. Auto-invoke on continue,
  want me to, should I, be more autonomous, anti-babysitting. Slash:
  /anti-babysitting-mandate. Policy home for Grok: ~/.grok/skills/anti-babysitting-mandate.
---

# Anti-babysitting mandate (repo)

Grok-global policy: `~/.grok/skills/anti-babysitting-mandate/SKILL.md`.
Pre-authorized classes: `.agents/skills/anti-babysitting/SKILL.md`.
Do not copy `.agents/skills/anti-babysitting-autonomous-loop` theater
(auto-merge-all / quarantine).

## Run

```bash
node tools/anti-babysitting-next.js --lint "$WRAPUP"
node tools/anti-babysitting-next.js --pick --fixture tests/fixtures/anti-babysitting-next.json --json
bin/anti-babysitting-next --pick --json
```

## NEVER / ALWAYS

| NEVER | ALWAYS |
|-------|--------|
| `--auto-merge-all` / merge another agent's PR | Own residuals only |
| `--quarantine` on first fail | `/ci-first-fail` then fix |
| End with "want me to?" | Act, then evidence |

## Related

- `/anti-babysitting-continue` · `/high-roi-steal-and-finish` · `/ci-first-fail`
