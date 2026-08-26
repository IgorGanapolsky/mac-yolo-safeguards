---
name: linear-basic-full-use
description: >
  HARD: Igor upgraded Linear to Basic (live org subscription type
  basic_monthly_12 = $12/user/month billed monthly, 1 seat, admin). Use every
  Basic capability; fail closed on Business-only features. Auto-invoke on
  Linear Basic, cycles, triage, initiatives, Linear Agent, MCP, prune labels,
  unused projects, webhook, git branch format. Slash: /linear-basic-full-use.
---

# Linear Basic — use the whole plan

**Measured live 2026-08-26** via GraphQL, not the marketing yearly $10 card:

- `subscription.type=basic_monthly_12`, seats=1, monthly $12
- Do **not** dual-edit Codex PR #2121 (`tools/linear-workspace-hygiene.js`,
  `tools/linear-agent-skill-exporter.js`)
- Companion skills: [[linear-basic-cycles-triage]], [[linear-basic-agent-mcp]],
  [[linear-basic-customers-evidence]]

```bash
node tools/linear-basic-full-use.js --demo --json
node tools/linear-basic-full-use.js --caps --json
node tools/linear-basic-full-use.js --export-agent-skills --json
node tests/test-linear-basic-full-use.js
python3 ~/.grok/skills/linear-basic-full-use/scripts/inventory.py
python3 ~/.grok/skills/linear-basic-full-use/scripts/prune_unused.py --apply
python3 ~/.grok/skills/linear-basic-full-use/scripts/enable_basic.py
```

If a mutation returns a plan error, record `PLAN_WALL: Business` and continue
on Basic rails. Never upgrade the plan. Never auto-buy AI credits.

## Basic we MUST use

| Capability | Fleet rule |
|---|---|
| Unlimited issues | Stop treating the old 250-issue Free cap as a reason to close work |
| 5 teams (2 used: `AGENT`, `IGO`) | `AGENT` = fleet locks. `IGO` = personal slot even at 0 open. Do not mint empty teams |
| Unlimited uploads | `attachmentCreate` PR/CI URLs on the issue, not a vault dump |
| Issues, projects, cycles, initiatives | One active initiative: *First Real Agency Cash*. AGENT weekly cycles, **cooldown 0**. Do not start a cycle early (Cycle 1 starts 2026-08-31) |
| Customer requests | `customersEnabled=true`. Named buyers/shops only |
| Pulse | `feedEnabled=true` |
| Triage | AGENT `triageEnabled=true`. New AGENT issues land in Triage, then `agent-lock` on claim |
| Git branch format | `{issueIdentifier}` so `AGENT-29` auto-links. Public PR comments OFF |
| Agent + MCP | Linear MCP via `scripts/linear_mcp.sh`. Agent skills included. Loops stay Business |
| Coding sessions | Allowed on Basic **if** AI credits remain. Fail closed at $0. Do not auto-buy |
| Templates | `Fleet claim`, `Bug`, `Agency cash` |

## Business — fail closed

Loops, Code Intelligence, Triage Intelligence, Insights, Dashboards, Linear Asks,
private teams, guests, SAML/SCIM, sub-initiatives, Releases, issue SLAs,
triage responsibility.

## Lock taxonomy (never prune)

Keep on AGENT: `agent-lock`, `agent-grok`, `agent-codex`, `agent-claude-code`,
`agent-cursor`, `agent-antigravity`, `agent-hermes`/`agent-Hermes`, `agent-jcode`,
`agent:<name>`, `status:agent-working`, `agents-multi`.

Session-suffix labels (`agent-codex-some-slug-20260826`) delete **only** after
every issue on them is completed/canceled. Never steal live locks.

Telemetry (`pr_merge_time:Nm`) is a **comment**, not a label.

## Prune

| Object | Delete when | Keep |
|---|---|---|
| Label | empty (not AGENT lock family) OR telemetry OR session-suffix with all issues closed | AGENT `agent-*` canonical even if empty |
| Project | trashed/archived **and** 0 issues including archived | Live product projects; MoodTracker (has IGO issues); trash with completed issues |
| App user | never via API | Linear Agent; Cursor OAuth. Devin is already inactive — Members UI only |

`projectDelete` moves to trash (recoverable). End-state counts beat mutation tallies.

## Related

- [[linear-basic-cycles-triage]]
- [[linear-basic-agent-mcp]]
- [[linear-basic-customers-evidence]]
- [[linear-no-steal-locks]]
- [[three-bus-ship-cycle]]
