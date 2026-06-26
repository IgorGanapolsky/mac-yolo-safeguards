# Technical Debt Audit — 2026-06-23

Repo: `mac-yolo-safeguards`  
Auditor: agent session (decision-stack + ground-truth scan)  
RAG anti-pattern applied: avoid canned "all clean" without evidence; scope to actual repo state.

---

## Executive summary

```
Files scanned: 355 tracked (+ ~120 key untracked hermes-mobile/agent files)
Issues found: 14
Issues fixed: 2
Files deleted: 1
Lines removed: 1 (jest-results.json was a single-line 110 KB JSON blob)
```

The repo has grown substantially since the May 2025 audit (10 tracked files → **355 tracked**, ~85k tracked lines). Most debt is **operational** (uncommitted Hermes Mobile work, flaky device E2E, CI workflow not on default branch), not dead-code accumulation. Black-screen prevention guards are in place and contract-tested.

---

## Phase 1 — Current state

### File / line counts

| Scope | Count |
|-------|------:|
| Git tracked files | 355 |
| Git tracked lines (`git ls-files` → `wc -l`) | 85,418 |
| `hermes-mobile/src/**` lines | 22,255 |
| `tools/*.js` scripts | 61 |
| Shell scripts (`scripts/` + `hermes-mobile/scripts/`) | 13 tracked |

### Test coverage (`npm run test:ci`)

| Metric | Before audit | After audit fixes |
|--------|-------------:|------------------:|
| Statements | 59.16% | **59.14%** |
| Branches | 45.82% | **45.91%** |
| Functions | 60.36% | **60.37%** |
| Lines | 59.47% | **59.44%** |
| Test suites | 79 pass | **80 pass** |
| Tests | 387 pass | **390 pass** |

**Not 100% coverage.** Lowest modules: `chatErrors.ts` (30.55%), `gatewayConnection.ts` (66.66%), `toolMessageDetails.ts` (67.85%).

### CI status (`gh run list --limit 5`)

Recent runs are **Internal Distribution** workflow on branch `agent/gemini/tmobile-antenna-fix` — 4 success, 1 failure (2026-06-23).

`mobile-continuous.yml` returns **HTTP 404** on default branch — workflow exists locally as **untracked** (`.github/workflows/mobile-continuous.yml`); not yet pushed/merged.

### Protected systems (`agent-session-start.js`)

| Component | Status |
|-----------|--------|
| `com.igor.shutdown-simulators` | loaded, interval 60s |
| `com.igor.hermes-mobile-continuous-e2e` | **running**, interval 900s |
| `com.igor.ceo-operating-brief` | loaded |
| `com.igor.react-native-newsletter-ingest` | loaded |
| `com.igor.hermes-contribution-opportunities` | loaded |
| Gateway | ok |
| Device | R3CY90QPM7E |
| Continuous E2E `latest.json` | unit **pass**, e2e **fail** (Maestro) |

---

## Phase 2 — Scoped audit findings

### hermes-mobile/ (black screen, connection UX, run-hermes-mobile)

**Black-screen prevention — landed and contract-tested:**

- `plugins/withEmbeddedJsBundle.js` → `debuggableVariants = []`
- `scripts/install-phone-release.sh` → release build + `verify-apk-package.cjs`
- `scripts/run-hermes-mobile.sh` → calls `install-phone-release.sh` (no `expo run:android`)
- `scripts/run-android-safe.sh` → blocks phone debug installs
- `npm run android:phone` → release path only
- `releaseSafetyContract.test.ts` + `apkReleaseGuards.test.ts` assert all of the above
- `.github/workflows/mobile-continuous.yml` (local, untracked) adds CI APK build + gradle guard

**Subagent work incorporated (working tree, uncommitted):**

| Subagent | Topic | State in repo |
|----------|-------|---------------|
| `e702e4f1` | Fix `run-hermes-mobile` | `run-hermes-mobile.sh` → `install-phone-release.sh` ✓ |
| `278f6ca8` | Black-screen prevention | CI workflow, guards, AGENTS.md rules ✓ |
| `4d103fac` | E2E verify black screen fix | Prevention stack present; release-safety tests pass |
| `2a87b497` | Connecting/stuck send UX | Partial: `macRetryBannerText`, `ChatConnectionPanel`, outbound `pending/sent/failed` status exist; E2E still flaky on persistence scroll |

**Continuous E2E failure (evidence):** `latest.json` e2e=fail. Log `run-20260623-124139.log`: `chat-send-persistence.yaml` failed attempt 1/2 scrolling to `"e2e persistence check"`; attempt 3 passed individually but cycle still marked fail.

**Dead components — already removed:**

- `OperatorActivityStrip` — **0 references**
- `CodexCommandBar` — **0 references**
- `OpsScreen` — screen removed; `OpsScreen.test.tsx` deleted in working tree
- `CodexCommandCenter` — **active** (used in `ChatScreen.tsx`)

All 27 `src/components/*.tsx` files have live imports.

### tools/ agent scripts

61 JS tools under `tools/`. Core orchestration (`agent-session-start.js`, `agent-decision-stack.js`, `hermes-mobile-pair.js`, `ceo-operating-brief.js`) are referenced from AGENTS.md and LaunchAgents. Revenue/pipeline tools are read-only against gitignored `business_os/` — not modified.

No orphaned tool scripts found with zero references in docs/AGENTS/plists.

### scripts/ install/bootstrap

- `scripts/install-agent-launchagents.sh` — active
- `scripts/bootstrap-zero-friction.sh` — referenced in AGENTS.md
- Duplicate APK verify: `verify-apk-package.sh` is intentional thin wrapper → `verify-apk-package.cjs` (DRY, not debt)

### Python in repo

4 files (not the "0 .py" state from May 2025 audit):

| File | Purpose |
|------|---------|
| `hermes-mobile/scripts/ensure_firebase_internal_distribution.py` | Firebase CI |
| `hermes-mobile/scripts/download_logs.py` | Log download |
| `scripts/kimi_hermes_bridge.py` | Kimi bridge (referenced in tool audit) |
| `scripts/skool_playwright_login.py` | Skool login automation |

All appear purpose-bound; none are orphaned.

### Docs / redirect drift

- `CLAUDE.md` — **deleted** (git status `D`)
- `GEMINI.md` — **deleted** (git status `D`)
- `AGENTS.md` line 3 still said "redirect here" — **fixed in this audit**

New docs in working tree (untracked): `docs/AGENT-AUTOMATIONS.md`, `docs/CURSOR-AUTOMATIONS.md`, `docs/REACT-NATIVE-NEWSLETTER-INGEST.md`, `hermes-mobile/AGENTS.md`.

### Config / prevention guards

| Guard | Verified |
|-------|----------|
| `debuggableVariants = []` in plugin + contract test | ✓ |
| `android:phone` release-only | ✓ |
| `run-android-safe.sh` blocks phone debug | ✓ |
| `mobile-continuous.yml` CI | Local only; **not on remote default branch** |
| AGENTS.md phone-install rule | ✓ |

---

## Phase 3 — Fixes applied this session

### Deleted files

| File | Justification |
|------|---------------|
| `hermes-mobile/jest-results.json` | Stale untracked Jest dump (302 tests / 63 suites vs current 390/80). Zero grep references. 110 KB single-line JSON artifact. |

### Refactored / corrected

| File | Change |
|------|--------|
| `AGENTS.md` | Line 3: document that `CLAUDE.md`/`GEMINI.md` were removed 2026-06; edit AGENTS.md only |

**Not fixed (out of safe high-value scope):**

- E2E `chat-send-persistence.yaml` scroll flake — needs Maestro flow tuning, not dead-code deletion
- 153 uncommitted files — user did not request commit
- `mobile-continuous.yml` not on default branch — needs push/merge, not local-only fix
- Connection UX when gateway stuck "Connecting" — partial code exists; full fix needs device repro + gateway state machine work

---

## RAG / .thumbgate read-only audit

- **41 lessons** indexed; top hit warns against canned tech-debt theater on already-clean repos
- `.thumbgate/` contains user feedback data — **not deleted or modified** (per consent rules)
- Prevention rules (`prevention-rules.md`): 9 weighted general recurrences; testing category from May revenue fiction incident
- No ThumbGate MCP capture this session — fixes were minor hygiene (1 stale artifact + 1 doc line)

---

## Gaps remaining (prioritized)

1. **Commit or split** the 74-file / +3936-line Hermes Mobile working tree — largest debt item
2. **Push `mobile-continuous.yml`** to enable cloud CI verification
3. **Stabilize device E2E** — `chat-send-persistence.yaml` scroll assertion flakes on Pixel
4. **Raise coverage** on `chatErrors.ts`, `gatewayConnection.ts`, `toolMessageDetails.ts` (connection/send paths)
5. **Resolve E2E vs unit divergence** — continuous agent reports 387 tests in log vs 390 in fresh `test:ci` (suite count grew in working tree)
6. **Connection honesty edge case** — when `connectionState=connecting` but HTTP health is green, sends may show `✓ Sent` before assistant reply; banner exists but Maestro persistence test still fails intermittently

---

## Verification evidence (this session)

```bash
node tools/agent-session-start.js          # LaunchAgents ok, e2e fail reported honestly
node tools/agent-decision-stack.js --task "technical debt audit cleanup" --json
cd hermes-mobile && npm run test:ci        # 80 suites, 390 tests, ~59% coverage
gh run list --limit 5                      # Internal Distribution runs visible
grep -r OperatorActivityStrip CodexCommandBar OpsScreen  # 0 matches
```

---

*Generated 2026-06-23. No git commit created (user did not request).*
