# Ralph Loop + GSD — 24/7 operations

**Mode:** continuous Get Shit Done (GSD) with Ralph PR babysitting + revenue cash path.

## What runs 24/7

| Agent | Interval | Job |
|-------|----------|-----|
| `com.igor.ralph-gsd-loop` | **30 min** | Unified cycle: GSD scan → Ralph PR → revenue |
| `com.igor.revenue-autonomous-loop` | 4 h | Full cash path (Stripe + follow-ups + send) |
| `com.igor.smart-ops` | 1 h | Heal agents + efficient revenue + market signals |

## One GSD cycle (`tools/ralph-gsd-loop.js`)

1. **Scan** — open PRs, pipeline stage counts, stellar ledger open checkboxes  
2. **Ralph** — `tools/ralph-pr-loop.sh --once` (update-branch + auto-merge; never force DIRTY)  
3. **Revenue** — `tools/revenue-autonomous-loop.js --auto-send --fast` (skip if receipt &lt; 20 min)  
4. **Receipt** — `business_os/revenue/ralph-gsd-cycles.jsonl` + daily board MD + ntfy (quiet on pure noop)

## Manual / proof

```bash
node tools/ralph-gsd-loop.js --once --json --force-revenue
bash scripts/verify-agent-automations.sh
launchctl print gui/$(id -u)/com.igor.ralph-gsd-loop | rg 'state =|run interval|last exit|working directory'
```

## Install

```bash
bash scripts/install-agent-launchagents.sh
# or revenue setup (also refreshes main-runtime):
bash scripts/setup-revenue-automations.sh
```

## Stellar product ledger

Long-running store/ASO/analytics checkboxes live in:

`hermes-mobile/docs/RALPH-GSD-STELLAR-JULY-2026.md`

The 24/7 loop reports open checkbox counts; agents still complete stellar tasks in worktrees.

## Honesty

- Cycle receipts are **ops evidence**, not cleared revenue.  
- Cleared cash still requires Stripe + ledger row.  
- Ralph never force-merges conflicted PRs.
