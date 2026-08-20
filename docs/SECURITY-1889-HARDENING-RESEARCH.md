# Deep Research: Securing `hermes-mobile/` in public `mac-yolo-safeguards`

**Date**: 2026-08-19  
**Trigger**: Security Issue #1889 — `API_SERVER_KEY` exposed for 25 days (Jul 25 → Aug 19)  
**Root Cause**: Public repo tracks full copy of `hermes-mobile/` (941 files, 3.5GB). Any secret committed there is world-readable.  
**Research scope**: How to structurally prevent this class of failure in August 2026, with detection layers that catch custom-prefix keys that vendor scanners miss.

---

## 1. Structural Fix — Don't Track `hermes-mobile/` in the Public Repo

### Options from Issue #1889

| Option | How | Pros | Cons |
|--------|-----|------|------|
| **1. Submodule** | `hermes-mobile/` → gitignored submodule pointer | Local tooling preserved; clean separation | Requires private GitHub repo; all agent worktrees need re-init; 3.5GB re-clone per worktree |
| **2. Gitignore** | `git rm -r --cached hermes-mobile/` + add to `.gitignore` | Smallest change; removes class of failure immediately | CI workflows that reference `hermes-mobile/` paths must fetch it separately; worktrees go stale |
| **3. Split** | Move mobile CI into `hermes-mobile` repo; stop mirroring | Clean long-term architecture | Largest change; all cross-repo workflows must be rewritten |

### Recommendation: **Option 2 (Gitignore) as immediate fix, Option 1 as follow-up**

**Immediate (within this PR cycle):**
```bash
# 1. Untrack hermes-mobile/ without deleting the local working copy
git rm -r --cached hermes-mobile/

# 2. Add to root .gitignore
echo "hermes-mobile/" >> .gitignore

# 3. Update CI workflows that depend on hermes-mobile/ paths
#    to fetch from the private source (see §3 below)
```

**Why Option 2 first**: Issue #1889 author explicitly deferred restructuring ("I did not restructure it unilaterally because several agent worktrees are live against `hermes-mobile/` paths here"). Gitignoring is reversible and minimal. Worktrees that need the files can fetch them via a separate mechanism.

**Follow-up — Option 1 (Submodule)**: If `hermes-mobile` exists as a private repo on GitHub, convert the gitignored directory to a submodule:
```bash
git submodule add git@github.com:IgorGanapolsky/hermes-mobile.git hermes-mobile
```
This preserves the directory structure for local tooling while ensuring no private content is tracked in the public repo. (Verified: `hermes-mobile` is NOT currently a separate GitHub repo — 404 at `github.com/IgorGanapolsky/hermes-mobile`. Would need to be created first.)

### CI workflow updates needed

The current `codeql-pattern-gate.js` and CI workflows reference `hermes-mobile/` paths directly:
```
# tools/codeql-pattern-gate.js
path.join(REPO, 'hermes-mobile', 'scripts'),
path.join(REPO, 'hermes-mobile', 'src'),
```
```
# .github/workflows/ci.yml — iOS/Android E2E, OTA, store release
hermes-mobile/app/
hermes-mobile/src/
hermes-mobile/scripts/
```

**Fix**: Add a CI step that fetches `hermes-mobile/` from its private source before running mobile-specific jobs:
```yaml
- name: Fetch hermes-mobile sources
  run: |
    git clone --depth 1 "$HERMES_MOBILE_PRIVATE_URL" hermes-mobile
  env:
    HERMES_MOBILE_PRIVATE_URL: ${{ secrets.HERMES_MOBILE_CLONE_URL }}
```

---

## 2. Detection — Catch Custom-Prefix Keys Vendor Scanners Miss

### Problem
GitGuardian has **no detector for the `API_SERVER_KEY` prefix** (per issue #1889). The key format is a Bearer token (alphanumeric + `.`/`_`/`-`, 12+ chars per `sessionContinuityHandoff.ts` regex: `/\bBearer\s+[A-Za-z0-9._-]{12,}/gi`). Semgrep missed it because `--exclude='test_merge.js'` excluded the exact file holding the key.

### Layer 1: gitleaks.toml — Add custom rule

The existing `.gitleaks.toml` has custom rules for `sk-or-v1-`, `tskey-`, `sk-ant-`, GLM, GitHub tokens, AWS keys, and a generic secret pattern. **Missing: the Hermes gateway API key format.**

```toml
[[rules]]
id = "hermes-gateway-api-key"
description = "Hermes gateway API_SERVER_KEY (bearer token, 12+ chars base62)"
regex = '''(?i)(?:api_server_key|hermes.*key|gateway.*key)\s*[:=]\s*['"](?:[A-Za-z0-9._-]{12,})['"]'''
keywords = ["API_SERVER_KEY", "hermes", "gateway"]
```

**Also update the generic-assigned-secret rule** to be more aggressive for `key`-named variables in `hermes-mobile/`:
```toml
[[rules]]
id = "hermes-key-assign"
description = "Any high-entropy value assigned to a hermes-mobile API key variable"
regex = '''(?i)(?:api_server_key|key|token|secret)\s*[:=]\s*['"](?:[A-Za-z0-9._-]{20,})['"]'''
keywords = ["key=", "token=", "secret="]
```

### Layer 2: CI "Public secret smoke scan" — Extend the git grep

Current CI step (in `.github/workflows/ci.yml` line 245):
```yaml
- name: Public secret smoke scan
  run: |
    set -eu
    ! git grep -nE '(ghp_[A-Za-z0-9_]+|github_pat_[A-Za-z0-9_]+|xai-[A-Za-z0-9_-]{20,}|AIzaSy[A-Za-z0-9_-]{20,}|sk_live_[A-Za-z0-9_]+|TELEGRAM_BOT_TOKEN=|STRIPE_SECRET_KEY=sk_|X-Goog-Signature=)' \
      -- ':!.github/workflows/ci.yml' '...'
```

**Add patterns for Hermes keys**:
```bash
# Add to the git grep regex:
|hermes.*key=['"][A-Za-z0-9._-]{12,}  # API_SERVER_KEY in hermes-mobile configs
|api_server_key['"]?\s*[:=]\s*['"][A-Za-z0-9._-]{20,}  # key=value or key: "value" forms
```

### Layer 3: CodeQL custom pattern (2026 approach)

Instead of relying on vendor prefix detection, use a **structural pattern**: any `.env` file, `config.ts`, or key-loading module that reads `API_SERVER_KEY` from environment and doesn't validate/redact it. This is the "fail-closed by default" pattern recommended by GitHub's August 2026 secret scanning guidance.

Create `.github/codeql/config.yml`:
```yaml
queries:
  - uses: security-research/security-extended
  - uses: security-research/security-and-quality
patterns:
  - pattern: "API_SERVER_KEY"
    message: "Any assignment of API_SERVER_KEY to a tracked file is a potential credential leak"
    paths-ignore:
      - hermes-mobile/.env.example  # template, allowed
      - hermes-mobile/.claude/memory/**  # feedback logs, redacted
```

### Layer 4: GitHub Secret Scanning custom pattern (org-level)

Per the August 2026 docs ([Defining custom patterns](https://docs.github.com/en/enterprise-cloud@latest/code-security/how-tos/secure-your-secrets/customize-leak-detection/define-custom-patterns)):

1. Navigate to **Settings → Security and quality → Secret Protection → Secret scanning → Custom patterns**
2. Create pattern:
   - **Name**: `Hermes Gateway API Key`
   - **Secret format** (regex): `[A-Za-z0-9._-]{20,}` (high-entropy bearer token)
   - **Additional match requirements**: `API_SERVER_KEY` or `key=` in surrounding context (≤20 chars before)
3. Click **Save and dry run** to test against existing history
4. Click **Publish pattern** and **Enable push protection**

This scans **entire Git history on all branches** — catching anything in `.git` that the smoke scan misses.

### Layer 5: Push protection (August 2026 feature)

GitHub's **push protection** (available on public repos with Advanced Security) blocks commits containing detected secrets before they land. For custom patterns, the "Enable" button in the GitHub UI activates this. This would have **prevented** the Jul 25 → Aug 19 exposure window entirely.

---

## 3. CI Hardening — Remove False Exclusions

### Remove `--exclude='test_merge.js'` from Semgrep

Issue #1889 explicitly calls out: *"Semgrep had `--exclude='test_merge.js'`, which excluded the exact file holding the key."* This exclusion was added to avoid false positives but created a blind spot.

**Fix**: Replace blanket exclusion with path-specific allowlists. In `.semgrep/` or wherever Semgrep config lives:
```yaml
# Instead of: exclude: 'test_merge.js'
# Use targeted false-positive suppression:
rules:
  - id: hermes-merge-secret-guard
    path_glob: ['!hermes-mobile/test_merge.js']  # never exclude the file, suppress specific patterns only
    patterns:
      - pattern-either:
        - pattern: "|key|=$VALUE"
          metavariable-pattern:
            metavariable: $VALUE
            patterns:
              - pattern-not-regex: 'sk-[a-z]{4}-test|secret-key|placeholder'  # allowlisted dummy values
```

### `secret_scanning.yml` exclusion config (for known-safe dirs)

Per GitHub docs, create `.github/secret_scanning.yml` to automatically close alerts for known-safe directories (like feedback memory logs):
```yaml
# Exclude feedback logs (values are redacted in-memory) and test fixtures
paths:
  - "hermes-mobile/.claude/memory/feedback/**"
  - "hermes-mobile/src/__tests__/**"
```
Note: This **closes alerts** — it does NOT prevent scanning. Use only for directories that contain redacted/dummy values.

---

## 4. Defense in Depth — Network Binding

Issue #1889 notes: *"API_SERVER_HOST binds `0.0.0.0`; tailnet-only or `127.0.0.1` would shrink the blast radius."*

**Fix**: In the gateway config, default to `127.0.0.1` and require explicit `HOST=0.0.0.0` for tailnet exposure:
```yaml
# gateway/config.yaml
api_server:
  host: 127.0.0.1  # was 0.0.0.0
  port: 8642
```

This is a code change in the Hermes gateway (private), but the `.env.example` and CI config should document the secure default.

---

## 5. Checklist — Implementation Order

| Priority | Action | File | Impact |
|----------|--------|------|--------|
| 🔴 P0 | `git rm -r --cached hermes-mobile/` + `.gitignore` | root `.gitignore` | Eliminates class of failure |
| 🔴 P0 | Add Hermes key regex to `gitleaks.toml` | `.gitleaks.toml` | Catches custom-prefix keys |
| 🟠 P1 | Extend CI "Public secret smoke scan" | `.github/workflows/ci.yml` | Gate on PRs |
| 🟠 P1 | Remove `--exclude='test_merge.js'` from Semgrep | Semgrep config | Closes blind spot |
| 🟡 P2 | Add CodeQL custom query for key assignments | `.github/codeql/` | History scan |
| 🟡 P2 | GitHub secret scanning custom pattern (org) | GitHub UI | Whole-history scan |
| 🟢 P3 | Push protection for custom patterns | GitHub UI | Pre-commit gate |
| 🟢 P3 | `API_SERVER_HOST` → `127.0.0.1` default | gateway config | Blast radius reduction |

---

## 6. Research Sources

- GitHub Docs: "Defining custom patterns for secret scanning" — enterprise-cloud latest
- GitHub Docs: "How-tos for customizing secret leak detection" — enterprise-cloud latest
- Git SCM docs: `git rm --cached` for untracking files without deleting working copy
- Git SCM docs: `.gitmodules` / `git submodule add` — submodules keep another repo as a subdirectory
- This repo's `.gitleaks.toml` — verified 6/6 key types missed by GitGuardian defaults (2026-07-14 audit)
- This repo's CI workflow (`ci.yml` line 245) — "Public secret smoke scan" git grep
- Issue #1889 — full root-cause analysis and options

## 7. What NOT to do (from 2026-08-19 incident learnings)

1. **Don't blanket-exclude files from scanners** (`--exclude='test_merge.js'`) — use targeted pattern suppression instead
2. **Don't rely on vendor default secret detection** — always add custom rules for your key formats
3. **Don't track private repo trees in public repos** — even "internal-only" content (memory logs, config, paths) leaks context
4. **Don't bind to `0.0.0.0`** without explicit justification — `127.0.0.1` is the secure default
5. **Don't rewrite Git history as cleanup** — rotation already made the old key worthless; a rewrite would force every agent worktree to re-clone (issue author's call, not an agent action)

---

## 8. August 2026 Web Research Sources

### GitHub Secret Scanning (enterprise-cloud latest, verified 2026-08-20)
- **Custom patterns** are configured per-repo or org-level via Settings → Security → Secret Protection → "Custom patterns" → "New pattern"
- Each pattern requires: **Pattern name** + **Secret format** (regex) + optional **Additional match requirements** (context before/after the secret, ≤1–1000 chars)
- **Dry run** tests the pattern against the repo's existing history (up to 1000 matches shown)
- **Push protection** (available for custom patterns) blocks commits containing detected secrets before they land — requires enabling after publish
- **Validity checks** tell you if a detected secret is still active/inactive (requires partner API integration)
- **secret_scanning.yml** config file can auto-close alerts for known-safe directories (paths must be explicitly listed; closing is not prevention)

### Git Submodules (git-scm.com, verified 2026-08-20)
- `git submodule add <url> <path>` replaces a tracked directory with a gitlink (commit pointer) + `.gitmodules` entry
- Submodule content is stored in the parent repo's `.git/modules/` — NOT in the tree history, so secrets in the submodule are not exposed in the parent repo
- `git submodule update --init --recursive` is required to populate the directory
- Public repo + private submodule: requires the user to have access to the private submodule repo; GitHub renders a public notice if the submodule is private

### Gitleaks (gitleaks/gitleaks, verified 2026-08-20)
- Custom rules use `[[rules]]` with `id`, `description`, `regex`, and `keywords` (keywords are pre-filter indices for performance)
- `regexTarget = "line"` for line-level matching, `regexTarget = "commit"` for multi-line
- Allowlists can be path-based (`.paths`), regex-based (`.regexes`), or both
- `--redact` flag redacts match in output; `--report-format` supports JSON, regex, etc.

### TruffleHog (trufflesecurity/trufflehog, verified 2026-08-20)
- Custom rules via `--rules /path/to/rules.json` (JSON file of `{"name": "regex"}` pairs)
- `--include_paths` / `--exclude_paths` filter by file path regex
- Sources from `https://github.com/dxa4481/truffleHogRegexes` as default base set
- Can scan full Git history with `file://` protocol

### Key format research (from hermes-mobile source, verified 2026-08-20)
- API_SERVER_KEY is used as `Authorization: Bearer <key>` header in `hermes-mobile/src/services/gatewayClient.ts:21` and `thumbgateClient.ts:124`
- Deep-link format: `key=<token>` in `hermes://setup?url=...&key=...` URLs
- Test fixtures show format `sk-test`, `sk-mini`, `sk-mbp-key`, `sk-legacy` — these are dummy values
- Bearer token regex in source: `/\bBearer\s+[A-Za-z0-9._-]{12,}/gi`
- Real production key format: not visible in repo (lives in `~/.hermes/.env`, gitignored)
- **Recommendation for gitleaks rule**: match `(api_server_key|hermes.*key|gateway.*key|key)\s*[:=]['"][A-Za-z0-9._-]{20,}['"]` as implemented in this PR
