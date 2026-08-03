# CodeQL security burn-down (2026-08-03)

## What was wrong

GitHub **Security → Code scanning** showed **33 open** alerts on `main` plus a red banner **“CodeQL is reporting errors”** (analysis pipeline / status — separate from the alert list).

## Fixes (this PR)

| Class | Fix |
|-------|-----|
| Incomplete URL host checks | `tools/lib/safe-url-host.js` + `URL.hostname` matching |
| Bad HTML / double-escape | `tools/lib/safe-html-strip.js` |
| ASC “password hash” FPs | `tools/lib/asc-jwt-es256.js` via `crypto.sign` (ES256 JWT, not password storage) |
| Clear-text SA logging | Firebase distribute script logs structural flags only |
| Shell injection | `execFileSync` / `spawnSync(..., { shell: false })` argv form |
| Incomplete JS string escape | hermes-mobile-pair deepLink escapes `\` then `'` |
| Workflow permissions | `workos-production-guard.yml` `permissions: contents: read` |
| ReDoS slugify | already split anchors in hermes-relay store |

## Automation

```bash
node tests/test-codeql-security-helpers.js   # offline unit
node tools/codeql-alert-sync.js --json       # list open alerts (needs gh)
node tools/codeql-alert-sync.js --gate --max-high 0 --max-open 5
```

CI: Public funnel runs `test-codeql-security-helpers.js`.

## Closing alerts

Open alerts clear only after **CodeQL re-analysis of the default branch** post-merge (not instantly on push). If counts stay high after merge + successful Analyze (javascript-typescript), re-check paths or dismiss residual FPs with evidence.


## Prevention (do not re-accumulate)

| Layer | Command / wiring | When |
|-------|------------------|------|
| **Offline pattern gate** | `node tools/codeql-pattern-gate.js` | Local / CI |
| **PR diff only** | `node tools/codeql-pattern-gate.js --diff origin/main` | Public funnel CI |
| **Pre-commit staged** | `.githooks/pre-commit` → `--staged` | Every commit |
| **Live alert budget** | `node tools/codeql-alert-sync.js --gate --max-high 0 --max-open 15` | CI (soft unless `CODEQL_GATE_STRICT=1`) |
| **Baseline freeze** | `--write-baseline` then `--check-increase` | After clean main scan |
| **Unit tests** | `tests/test-codeql-pattern-gate.js` + helpers | CI |

### Banned without shared helpers

1. `createSign('SHA256')` for ASC JWT → `tools/lib/asc-jwt-es256.js`
2. `execSync(\`...\${}...\`)` or `shell:true` → `execFileSync` / argv spawn
3. `url.includes('reddit.com')` host checks → `tools/lib/safe-url-host.js`
4. Naive `<script>...</script>` strip → `tools/lib/safe-html-strip.js`
5. `console.log(process.env.*)` → log booleans only
6. `.replace(/^-+|-+$/g, '')` → two anchored replaces
7. Workflows without top-level `permissions:`

### After merge

1. Wait for CodeQL Analyze on `main` to close fixed alerts.
2. `node tools/codeql-alert-sync.js --write-baseline` (captures open/highish counts).
3. Enable repo variable `CODEQL_GATE_STRICT=1` once open ≤15 and highish=0.
