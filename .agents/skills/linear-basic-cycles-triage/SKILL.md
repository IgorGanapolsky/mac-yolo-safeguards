---
name: linear-basic-cycles-triage
description: >
  Operate AGENT weekly cycles (cooldown 0) and triage on Linear Basic.
  Do not start Cycle 1 before 2026-08-31. Do not call triageResponsibilityCreate
  (Business). Auto-invoke on Linear cycles, cooldown, triage, cycle rollup,
  start upcoming cycle. Slash: /linear-basic-cycles-triage.
---

# Linear Basic — cycles + triage

Live 2026-08-26: AGENT `cyclesEnabled=true`, `cycleCooldownTime=0`,
`triageEnabled=true`, `activeCycle=None`. Cycle 1 = 2026-08-31 → 2026-09-07.
IGO keeps cycles/triage **off** (personal slot, 0 issues).

```bash
node tools/linear-basic-full-use.js --caps --json
python3 ~/.grok/skills/linear-basic-full-use/scripts/enable_basic.py
```

## MUST

- New AGENT issues land in **Triage**, then `agent-lock` + `agent-grok` on a real claim.
- Use templates `Fleet claim` / `Bug` / `Agency cash`.
- `gitBranchFormat={issueIdentifier}` so `AGENT-29` auto-links.
- Cycle rollup is a comment, never a `pr_merge_time:Nm` label.
- Timezone `America/New_York`. Upcoming cycle count 4.

## NEVER

- `cycleStartUpcomingCycleToday` before 2026-08-31
- `triageResponsibilityCreate` (PLAN_WALL Business)
- Mint a third empty team to "use the 5-team cap"
- Enable cycles on IGO just to look busy

## Related

- [[linear-basic-full-use]]
- [[linear-no-steal-locks]]
