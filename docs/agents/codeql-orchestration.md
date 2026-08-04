# CodeQL / Code scanning — AI orchestration & hygiene

**Problem class (2026-08):** Security → Code scanning showed 20–33 open Highs. Agents dismissed noise, fixed patterns on feature branches, claimed “clean,” and never merged. The UI is always **`branch:main`**. Unmerged work is invisible there.

## Single control plane

```bash
# Every agent session (also wired into agent-session-start)
node tools/codeql-agent-hygiene.js --session-start

# Before any “security clean / 0 open alerts” claim
node tools/codeql-agent-hygiene.js --claim "security clean"

# Before merging security / tools / CI PRs
node tools/codeql-agent-hygiene.js --pre-ship

# Offline pattern ban (no network)
node tools/codeql-pattern-gate.js
node tools/codeql-pattern-gate.js --diff origin/main
node tools/codeql-pattern-gate.js --staged   # pre-commit

# Live budget + FP dismiss
node tools/codeql-alert-sync.js --json
node tools/codeql-alert-sync.js --gate --max-high 0 --max-open 15
node tools/codeql-alert-sync.js --dismiss-fps   # residual test/JWT only
```

## Orchestration layers (all required)

| Layer | Owner | Fail mode |
|-------|--------|-----------|
| Offline pattern gate | `codeql-pattern-gate.js` | Exit 1 on banned patterns |
| Pre-commit | `.githooks/pre-commit` | Blocks commit |
| CI Public funnel | `.github/workflows/ci.yml` | PR cannot go green |
| Session brief | `agent-session-start.js` → hygiene | Agents see open_on_main every turn |
| Ship-claim | `ship-claim-gate.js` security phrases | Blocks false “clean” claims |
| Live budget | `codeql-alert-sync.js --gate` | Soft unless `CODEQL_GATE_STRICT=1` |
| Shared helpers | `tools/lib/safe-*.js`, `asc-jwt-es256.js` | One correct implementation |
| Playbook | `docs/CODEQL-SECURITY-BURN-DOWN.md` | Human + agent runbook |

## Hard rules for agents (Never list)

1. **Never** claim Security tab clean without `gh` API `state=open` count on **main**.
2. **Never** treat a green PR CodeQL check as “main is clean.”
3. **Never** re-implement ASC JWT, host substring checks, HTML script strip, or shell `execSync(\`...\`)` — use helpers.
4. **Never** open a parallel “CodeQL burn-down” branch while one is open — finish/merge the existing PR.
5. **Never** dismiss product alerts as FP without file:line evidence; tests/JWT only via `--dismiss-fps`.

## After a burn-down merges

```bash
# Wait for Analyze (javascript-typescript) on main
node tools/codeql-alert-sync.js --json          # expect open→0 or residual only
node tools/codeql-alert-sync.js --write-baseline
# When open≤15 and highish=0:
#   gh variable set CODEQL_GATE_STRICT --body 1
```

## Coordination

- Task id prefix: `T-CODEQL-*`
- File claim: hygiene tools + `docs/CODEQL-SECURITY-BURN-DOWN.md` + this file
- Megafile caution: do not thrash `plan.md` ownership; append Decisions only
