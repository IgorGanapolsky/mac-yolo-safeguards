---
name: intent-contract
description: >
  HARD: durable product intent linked to code and tests (Tieline-inspired).
  Auto-invoke before product coding, before claiming done/shipped, when ACs
  drift, blast radius, "what implements this", or user stories vs code.
  Slash: /intent-contract. Not affiliated with knoxgraeme/tieline.
---

# Intent contract

**Steal (process only):** Tieline's Capability → Story → AC → file/test evidence,
graded `supported|partial|unsupported|broken`, plus blast radius on a git base.
We do **not** vendor their Postgres/MCP. Merge still accepts the YAML.

## How this improves the fleet

Agents stop inventing "done" from chat memory. The contract names the user-visible
behavior and the files/tests that prove it. `intent-check` fails if a link is
dead or locked copy drifted. `--base origin/main` lists ACs the branch may have
touched. Unmapped files stay unclaimed — do not author an AC just to zero that list.

Complements `/coding-context-pack` (issue FOCUS) and `/grade-completion-claims`
(status sentences). This layer is **accepted behavior ↔ paths**.

## Run

```bash
node scripts/intent-check.js
node scripts/intent-check.js --json
node scripts/intent-check.js --base origin/main
node scripts/intent-check.js --path apps/hermes-control-plane/app/page.tsx
bin/intent-check --ac OFFER-001-AC1 --json
```

A linked test is a locator. Do not claim the test ran.

## NEVER / ALWAYS

| NEVER | ALWAYS |
|-------|--------|
| Claim shipped without `intent-check` ok on touched ACs | Update `.intent/contract.yaml` in the same PR when observable behavior changes |
| Author an AC just to zero unmapped files | Grade from path existence + authored content checks |
| `npx tieline` / their Postgres as a dependency | Keep the slim checker + YAML |
| Name Qoder/Tieline as affiliation | "Inspired by, not affiliated" |
| Restore Continuity, Mac-pair, phone leash, or a RUN ON picker to make a test pass | Read `/listen-to-chief` before editing landing copy |

## Closeout (before PR)

1. `git diff --name-only origin/main...HEAD`
2. `node scripts/intent-check.js --base origin/main --json`
3. For each affected AC: still true? If not, edit `.intent/contract.yaml`
4. New user-visible behavior with no AC → add Story/AC + links

## Related

- `/tieline-product-contract` · `/coding-context-pack` · `/grade-completion-claims`
