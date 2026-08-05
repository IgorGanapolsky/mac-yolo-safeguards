---
name: coding-context-pack
description: >
  HARD issue-first coding context (HF Context Course pattern): before product
  coding load the smallest pack that proves what "correct" is (open GH Issue AC +
  Linear + e2e gate + skills). Auto-invoke at coding session start, when user says
  "what should we work on", "focus issue", "context pack", "automate coding context",
  after ship theater, before claiming done/shipped. Slash: /coding-context-pack.
---

# Coding context pack (issue-first)

**Principle:** Code agents are only as good as the context they can find. Load the
**smallest** context that proves correct (issue AC) and that proves landed
(tests + three buses). Do not rebuild the board from chat memory.

## Auto-run (every product coding turn)

```bash
cd "$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
# Prefer monorepo root (parent of hermes-mobile)
node tools/coding-context-pack.js --minimal
# Full board + AC hints:
node tools/coding-context-pack.js
# Focus one issue:
node tools/coding-context-pack.js --issue 132
# Persist for handoff:
node tools/coding-context-pack.js --write
# Triple-bus sync (GH Issues ↔ Linear ↔ vault product board):
node tools/coding-context-pack.js --sync
# Before "done/shipped":
node tools/coding-context-pack.js --ship-check --pr <N> --agent AGENT-XXX
```

`node tools/agent-session-start.js` already prints `--minimal` every session.

## What the pack contains

| Field | Use |
|-------|-----|
| **FOCUS** | Ranked next open GH Issue (p0, ready, open PR boost; blocked deprioritized) |
| **linear_id** | From vault `GITHUB-PRODUCT-BOARD.md` |
| **related_prs** | Open PRs mentioning the issue |
| **acceptance_hints** | Checkboxes / AC lines from issue body |
| **skills** | On-demand routes (connect, verify-ship, three-bus, multi-agent-coord) |
| **ship_claim_gate** | Blocks "device fixed" when e2e≠pass |
| **e2e_proof** | `hermes-mobile/docs/proofs/continuous/latest.json` |

## Coding loop (smart default)

```
1. coding-context-pack --minimal     → FOCUS + ship_gate
2. claim files in plan.md + Linear   → multi-agent-coord / linear-no-steal
3. implement only AC slice
4. verify (npm test / continuous e2e as required)
5. three-bus-ship-cycle              → GH evidence + Linear + vault
6. coding-context-pack --write       → refresh board; next FOCUS
```

## Workflow fan-out

For multi-issue board + adversarial verify:

```text
/coding-context-loop
/coding-context-loop {"smoke": true}
/coding-context-loop {"issue": 132}
/mac-yolo-issues-board
```

## Never

| Never | Always |
|-------|--------|
| Claim fixed from chat memory alone | Show pack FOCUS + test output |
| Load revenue/social skills for UI fix | On-demand skills from pack only |
| Treat e2e=skipped as pass | Honest UNVERIFIED or run E2E |
| Skip three buses on ship | `/three-bus-ship-cycle` |

## Related

- `tools/coding-context-pack.js`
- `tests/test-coding-context-pack.js`
- [[three-bus-ship-cycle]]
- [[multi-agent-coord]]
- Grok workflows skill (PR review / Linear triage / enforcement audit)
- HF Context Course unit0 introduction (huggingface.co/learn/context-course)
