# CodeQL security hygiene (prevent recurrence)

## What went wrong (2026-08-03)

GitHub **Security → Code scanning** showed **20–33 open High** alerts plus **“CodeQL is reporting errors”**. Most were:

| Class | Reality |
|-------|---------|
| `js/insufficient-password-hash` | ASC JWT / content HMAC — **not** password storage |
| `js/incomplete-url-substring-sanitization` | Tests using `url.includes('host.com')` |
| `js/shell-command-injection-from-environment` | Local scripts/`bash -c` tests |
| Real-ish product | ReDoS slugify, incomplete HTML strip, pair escape, workflow `permissions` |

This is static analysis debt — not an active compromise.

## Shared helpers (use these, always)

| Problem | Helper |
|---------|--------|
| ASC ES256 JWT | `tools/lib/asc-jwt-es256.js` → `makeAscJwt` |
| Host allowlists | `tools/lib/safe-url-host.js` |
| HTML → text | `tools/lib/safe-html-strip.js` |
| exec without shell | `tools/lib/safe-exec.js` / `execFileSync` argv |

## Prevention layers (must stay wired)

| Layer | Command | Wired |
|-------|---------|-------|
| Offline pattern gate | `node tools/codeql-pattern-gate.js` | CI Public funnel + pre-commit |
| PR diff only | `node tools/codeql-pattern-gate.js --diff origin/main` | CI |
| Unit tests | `tests/test-codeql-pattern-gate.js`, `tests/test-codeql-security-helpers.js` | CI |
| Live budget | `node tools/codeql-alert-sync.js --gate --max-high 0 --max-open 15` | CI soft; `CODEQL_GATE_STRICT=1` hard |
| Baseline freeze | `--write-baseline` then `--check-increase` | After clean main scan |
| Dismiss residual FPs | `node tools/codeql-alert-sync.js --dismiss-fps` | Manual / post-merge |
| CodeQL paths-ignore | `.github/codeql/codeql-config.yml` | Default setup config file |

### Banned patterns (gate fails CI)

1. `createSign('SHA256')` for ASC JWT
2. `execSync(\`...\${}...\`)` or `shell: true`
3. `url.includes('reddit.com')`-style host checks (use `URL.hostname`)
4. Naive `<script>...</script>` strip without `\s*` before `>`
5. `console.log(process.env.*SECRET*)`
6. `.replace(/^-+|-+$/g, '')` ReDoS trim polyfill
7. Workflows without top-level `permissions:`

### After every security burn-down merge

```bash
# Wait for CodeQL Analyze (javascript-typescript) on main to finish
node tools/codeql-alert-sync.js --json
node tools/codeql-alert-sync.js --dismiss-fps   # residual test/JWT FPs only
node tools/codeql-alert-sync.js --write-baseline
# Optional once open≤15 and high=0:
# gh variable set CODEQL_GATE_STRICT --body 1
```

## CodeQL default setup config

File: `.github/codeql/codeql-config.yml` (paths-ignore for tests/vendor).

If default setup is not yet reading the file, set it once:

```bash
gh api -X PATCH repos/IgorGanapolsky/mac-yolo-safeguards/code-scanning/default-setup \
  -f state=configured \
  -f query_suite=default \
  -f codeql_config_file='.github/codeql/codeql-config.yml'
```

(Or Security → Code scanning → CodeQL → Edit configuration → configuration file.)

## AI orchestration entry

```bash
node tools/codeql-agent-hygiene.js --session-start
node tools/codeql-agent-hygiene.js --pre-ship
node tools/codeql-agent-hygiene.js --claim "security clean"
```

Agents: [docs/agents/codeql-orchestration.md](./agents/codeql-orchestration.md).
