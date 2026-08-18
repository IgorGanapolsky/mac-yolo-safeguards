---
name: tieline-product-contract
description: >
  Tieline process steal: reviewed source of truth for product behavior and
  product-level blast radius. Use when asking how Tieline improves our
  system, before editing offer/landing files, or when a PR may silently
  change buyer-visible ACs. Slash: /tieline. Not affiliated with knoxgraeme/tieline.
---

# Tieline → our process (not HVAC, not their product)

Source: [knoxgraeme/tieline](https://github.com/knoxgraeme/tieline) (2026-08-18).
ICP is agent-coding / product-intent, **not** HVAC owners. Transfer is fleet
process. Do not rebuild Tieline. Do not `npx tieline`.

## What we steal

| Tieline | Here |
|---------|------|
| Capability → Story → AC → evidence | `.intent/contract.yaml` |
| `tieline check --base` | `node scripts/intent-check.js --base origin/main` |
| Graded evidence (`supported` / `partial` / `unsupported`) | Same grades + `broken` for missing paths |
| AC-aware blast radius | Changed files → affected AC keys |
| Merge is acceptance | YAML travels with the PR |
| Do not AC-fill unmapped files | `blast.unclaimed` is a question, not a fail |

## What we do not steal

Postgres sync, MCP planning tools, Tree-sitter topology, `npx tieline`, invented
SKUs, Cloud-vs-Local as a second paid product, digital-employee stats.

## How this improves *our* system

1. **Silent offer regressions become exit 1.** A deleted `$10/mo` string or a
   revived "ThumbGate Wake" card fails `OFFER-001` / `START-001` before review.
2. **Agents get a neighborhood, not the whole repo.** `--path HostingSelector.tsx`
   returns `HOST-001-AC1` instead of grepping 50k lines.
3. **PR closeout names blast radius.** `--base origin/main` lists ACs the diff
   may have broken. Complements `/grade-completion-claims` (chat claims) and
   `/check-stale-vault-claims` (vault leases).

## Protocol

1. Before editing offer/landing files: `bin/intent-check --path <file>`
2. Implement without violating `must_contain` / `must_not_contain`
3. If behavior changed, edit `.intent/contract.yaml` in the same PR
4. `node scripts/intent-check.js --base origin/main --json`

Checker: `/intent-contract`. Product lock: `/listen-to-chief`.
