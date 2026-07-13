# Prevent Recurrence — July 2026 Session Lessons

**Audience:** Igor's AI fleet (Cursor parent + workers, Claude Code, Codex, Gemini, Antigravity)  
**Companion:** [MULTI-AGENT-VAULT-COORDINATION-JULY-2026.md](./MULTI-AGENT-VAULT-COORDINATION-JULY-2026.md)  
**Last updated:** 2026-07-13

This document maps **nine failures from the 2026-07-10 session** to durable prevention: automated guards, process rituals, and vault coordination. One pass — no duplicate research subagents.

---

## Problem → root cause → prevention

| # | Problem | Root cause | Prevention | Type |
|---|---------|------------|------------|------|
| 1 | Duplicate Cursor subagents (tap-again, merge PRs, research twice) | Parent spawned workers on an already-owned file domain; no `plan.md` §2 check before `Task` | **Single-pass rule** (below); one parent per lock domain; workers inherit worktree | Process + Cursor rule |
| 2 | ASC review notes pasted operator gateway URL + API key | Human/agent pasted live infra into App Review Information; Chrome path bypassed safe template | `asc-review-notes-guard.js` + `verify-asc-listing.js` exit 1; **`bash scripts/agent-pre-asc-edit.sh`** before any ASC edit; only `patch-asc-review-notes.js` / `ASC_SAFE_REVIEW_NOTES` | **Automated guard** |
| 3 | False "phone not connected" from stale adb | `adb devices` read without `kill-server` retry; `agent-session-start.js` and `hermes-mobile-pair.js` call raw `adb` | **`bash scripts/agent-adb-refresh.sh`** at session start when USB work expected; Maestro already uses `restart_adb_server` in `maestro-env.sh` | **Automated + checklist** |
| 4 | LipoShield splash on stale simulator dev build after template fork | iOS sim ran old **dev-client** binary from LipoShield/random-timer fork; splash assets baked into stale `.app` | Release path only on device; sim: delete app + `npx expo prebuild --clean` when branding wrong; `releaseSafetyContract.test.ts` bans LipoShield creds in docs | Process + unit contract |
| 5 | "Tap again" no-op on wrong-key retry | Phone saved Mac mini URL with laptop `API_SERVER_KEY`; `/health` unauthenticated = 200, chat 401 | `probeGatewayAuth` + UI "Wrong key for this computer"; **`node tools/hermes-mobile-pair.js --mini-tailscale`** (SSH-fetches mini key); `RELEASE-SAFETY-NET.md` T-120 | **Automated (unit) + pair ritual** |
| 6 | Multi-agent branch thrashing without vault coordination | Agents edited shared checkout; skipped vault pull + `plan.md` claim; uncommitted WIP lost on switch | Vault session start (2 min); `plan.md` claim + commit first; worktree per parallel agent; `Handoffs/` for cross-agent | **Vault + plan.md** |
| 7 | Continuous E2E skipped (`simruntime 159 > 80`) — no green proof | `run-continuous-e2e.sh` correctly skipped under load; agents still claimed "fixed" | Read `docs/proofs/continuous/latest.json`; if `e2e=skipped`, run `sim-runaway-guard.sh` or wait; **`HERMES_E2E_FORCE=1`** only after load drop; never ship on skipped proof | Process + honesty |
| 8 | Ship claims without evidence ("are you sure?") | Skipped `agent-session-start.js --full`, ThumbGate recall, and `latest.json` | Honesty protocol in parent `AGENTS.md`; same-turn evidence (test output, JSON, SHA); `mcp__thumbgate__capture_memory_feedback` after false claims | **Process + RAG** |
| 9 | Name repair overwritten + app dropped to launcher | Three concurrent `agent-session-start.js` runs each called `hermes-mobile-pair.js` + queued `install-phone-release.sh`; `openDeepLinkOnDevice` passed `&name=` unquoted to Android shell | **`tools/agent-phone-pipeline-lock.js`** mutex in `agent-session-start.js` + `hermes-mobile-pair.js`; defer pair when install job queued; single-quote URI in adb shell; no detached install fallback | **Automated lock** |

---

## Cursor-specific: when NOT to spawn subagents

**Single-pass rule:** The parent agent does the work in one pass unless file domains are **disjoint** and **unowned** in `plan.md` §2.

| Do NOT spawn | Why |
|--------------|-----|
| Second worker on same file(s) another agent owns | Duplicate PRs, revert wars |
| Research subagent when parent already read vault + `plan.md` | Duplicate synthesis, wasted tokens |
| Parallel merge/PR subagents on same branch | Race on `git push` |
| Subagent to "verify" without parent reading `latest.json` | False green claims |
| Worker to edit ASC review notes | Parent must run `agent-pre-asc-edit.sh` first; use API patch script only |

**When spawning is OK:** Disjoint file sets, all `(free)` in §2, parent already claimed `plan.md`, child inherits parent's worktree path.

**Hierarchy that scales:** planner (vault + plan + recall) → single worker (one file set) → verifier (tests + `latest.json`) — not planner → two workers on chat send.

---

## Mandatory session checklist

Run at **every** Hermes Mobile / store / device session (≤3 min):

```bash
# 1. Vault coordination (separate repo — survives branch churn)
git -C ~/Documents/AI-Agent-Sync pull
# Read: Agent-State/latest.json, current-handoff.md, newest Handoffs/
git -C ~/Documents/AI-Agent-Sync status --porcelain   # uncommitted = agent LIVE

# 2. Repo orchestrator + E2E truth
node tools/agent-session-start.js                     # parent repo root
# Before ship claims:
node tools/agent-session-start.js --full

# 3. plan.md locks
node tools/plan-coordination-snapshot.js --json       # parse §2 before edit

# 4. ADB refresh (before phone/pair/E2E — not optional when USB expected)
bash hermes-mobile/scripts/agent-adb-refresh.sh

# 5. ASC edits ONLY after guard passes
bash hermes-mobile/scripts/agent-pre-asc-edit.sh      # runs verify-asc-listing review-notes check

# 6. ThumbGate recall for current task
# mcp__thumbgate__recall or node tools/agent-decision-stack.js --task "..." --json
```

**Before claiming chat/UI fixed:** `cat hermes-mobile/docs/proofs/continuous/latest.json` — report `unit` + `e2e` verbatim if not `pass`.

**Before ASC / App Review copy:** Never paste from operator `.env`, gateway health output, or Tailscale URLs. Canonical: `scripts/asc-review-notes-safe.js` → `hermes://setup?demo=1` only.

**Before simulator UX proof:** Uninstall stale app; prefer release APK on USB Android over sim dev-client when branding matters.

---

## CI / pre-commit hooks — in place vs gaps

### Already in place

| Gate | Location | Catches |
|------|----------|---------|
| Hermes TS pre-commit | `.githooks/pre-commit` | Typecheck + related Jest on staged `hermes-mobile/**/*.ts(x)` |
| ASC review notes patterns | `scripts/asc-review-notes-guard.js` | `ts.net`, `sk-hermes`, tailnet IPs, gateway deeplinks in notes text |
| ASC listing verifier | `scripts/verify-asc-listing.js` | Live ASC notes violations → exit 1 |
| Safe notes unit tests | `ascReviewNotesGuard.test.ts`, `ascReviewNotesSafe.test.ts` | Regressions in guard + template |
| Release safety contract | `npm run test:release-safety` | Wrong-key pair wiring, LipoShield doc ban, Maestro tier-0 list |
| Wrong-key auth probe | `gatewayClient.test.ts`, `gatewayConnection.test.ts` | False Connected + tap-again class |
| E2E load guard | `run-continuous-e2e.sh` | Mac freeze when load/simruntime high |
| ADB restart in E2E | `maestro-env.sh` → `restart_adb_server` | Stale adb during Maestro only |
| Runtime lock | `agent-resource-lock.js` in continuous E2E | Metro/ADB fights between agents |
| GitHub mobile CI | `.github/workflows/mobile-continuous.yml` | Unit + coverage on schedule |
| Honesty / ship gate | Parent `AGENTS.md`, OpenMono `/ship-claim` | Evidence before "shipped" language |

### Gaps to add (prioritized)

| Gap | Risk | Proposed fix |
|-----|------|--------------|
| `check-staged-ownership` documented but **not wired** in current `.githooks/pre-commit` | Cross-agent file clobber at commit time | Re-add `node tools/plan-coordination-snapshot.js check-staged-ownership` to pre-commit (T-37 intent) |
| `agent-session-start.js` skips `adb kill-server` | False "no device" at session start | Call `agent-adb-refresh.sh` when pairing queued |
| `hermes-mobile-pair.js` raw `adb devices` | Pair fails on stale daemon | Retry after `restart_adb_server` once |
| Concurrent session-start pair+install | Name repair overwritten; cold-start storm drops app to launcher | `agent-phone-pipeline-lock.js` + skip pair when install job queued; quote `&name=` in adb shell |
| `e2e=skipped` in `latest.json` not escalated | Ship theater | `verify-continuous-e2e.sh` warn + CEO brief flag when skipped >30m |
| No pre-commit on ASC note **draft files** in repo | Accidental commit of secrets in draft md | Optional: guard staged `*review*notes*` paths |
| Sim stale branding | Wrong splash on sim | Document: `xcrun simctl uninstall` + clean prebuild in install runbook |

---

## Quick reference scripts

| Script | When |
|--------|------|
| `bash scripts/agent-pre-asc-edit.sh` | Before any ASC review notes / App Review Information edit |
| `bash scripts/agent-adb-refresh.sh` | Session start, before pair, before "phone not connected" diagnosis |
| `node scripts/verify-asc-listing.js` | ASC status audit; fails on unsafe live notes |
| `node scripts/patch-asc-review-notes.js` | Apply safe template via API (preferred) |
| `node tools/hermes-mobile-pair.js --mini-tailscale` | Multi-Mac — never laptop key on mini URL |

---

## Mega-session / compaction thrash (2026-07-13)

**Symptom class:** 1.7M+ token Hermes Mobile chats → compaction stubs ("Earlier conversation summarized to save context"), no real reply, Retry theater, missing prompts.

| Layer | Gate | Location |
|-------|------|----------|
| WARN | ≥ 350k tokens — banner + confirm before Send | `sessionTokenGuards.ts` `MEGA_SESSION_TOKEN_WARN` |
| BLOCK | ≥ 800k tokens — **hard-block Send** (no Send anyway); composer muted; Recents "Too large" forces Start fresh | `MEGA_SESSION_TOKEN_BLOCK` + `ChatScreen` / `RecentChatsList` |
| Compaction stall | Summarization-only assistant turn → keep polling + auto-offer Start fresh once | `chatCompactionHandoff.ts` + `ChatScreen` |
| Unit | `shouldAllowMegaSessionSend`, thresholds, recents badge | `sessionTokenGuards.test.ts`, `chatCompactionHandoff.test.ts`, `RecentChatsList.test.tsx` |

**Operator rules (Igor):**

1. Prefer **Start fresh chat** when a thread crosses ~350k or shows a summarization stub — do not keep Retrying.
2. Never reopen a **Too large** recent expecting a reply; fork first.
3. Do not raise `MEGA_SESSION_TOKEN_BLOCK` back toward 2M without a proven gateway-side refuse.
4. Gateway note: Hermes gateway does not yet refuse continue-by-token; mobile hard-block is the product gate. If adding gateway refuse later, mirror the 800k threshold.
5. After any mega-session UX change: focused Jest on the three files above + kick continuous E2E; do not claim fixed while `latest.json` `e2e=skipped`.

Shipped hardening: PR #151 (initial unblock), #186 (stall CTA + WARN 350k), T-186 (BLOCK 800k + auto-offer + recents force-fresh).

---

## Desktop gateway token burn (2026-07-13, session `api_1783962481`)

**Incident:** 833k input tokens burned on the mini before the session was deleted. Root cause: dead CDP browser tool (`browser.cdp_url=ws://localhost:9222` but the `com.hermes.chrome-cdp` LaunchAgent was disabled 2026-06-29; 9222 held by plain Chrome, `/json/version` 404) failed ~30 consecutive calls while ~26k tokens of pinned context were re-sent on every call (nemotron, 40k window), two asyncio turns ran concurrently on the same session, and no session-level token ceiling existed.

**Guardrails now live on both Macs (`~/.hermes/config.yaml`, backups `.bak-20260713-token-burn-guardrails`):**

| Guardrail | Setting | Machine |
|-----------|---------|---------|
| Same-tool failure circuit breaker | `tool_loop_guardrails.hard_stop_enabled: true`, `hard_stop_after.same_tool_failure: 5`, `exact_failure: 4` | both |
| Dead browser toolset off | `agent.disabled_toolsets: [browser]` | mini only — **lifted 2026-07-13** after CDP `/json/version` returned 200 (Chrome/150); `computer_use` remains disabled. `config.yaml` had `uchg` immutable flag blocking saves — clear with `chflags nouchg` before toolset writes. |
| Serialize api_server turns | `gateway.api_server.max_concurrent_runs: 1` (mini) / `2` (MBP) | both |
| Session input-token ceiling | `HERMES_MAX_SESSION_INPUT_TOKENS` env, default **500k** (0 disables) — local patch in `~/.hermes/hermes-agent/agent/conversation_loop.py`, commits mini `fa43a03c0` / MBP `af21538c90`, fork branches `mini/mbp-local-guardrails-20260713` | both |
| Phone toolset toggles | `features.toolsets_write` + `PUT /v1/toolsets/{name}` on api_server (local patch 2026-07-13) | both — without this, mobile shows view-only / "Update Hermes" and switches are dead |

**Operator rules:**

1. Never re-enable the `browser` toolset on a machine without proving `curl http://localhost:9222/json/version` returns 200 first.
2. If phone toggles fail with `PermissionError` saving `config.yaml`, check `ls -lO ~/.hermes/config.yaml` for `uchg` and run `chflags nouchg ~/.hermes/config.yaml`.
3. The 500k desktop ceiling aligns with the mobile WARN gate (350k) and sits under the mobile BLOCK (800k) — keep that ordering if any threshold moves.
4. `~/.hermes/hermes-agent` is a **git fork checkout** (IgorGanapolsky/hermes-agent), not pip site-packages — patch + commit there, and remember `hermes update` may stash local changes (`updates.non_interactive_local_changes: stash`). Do **not** scp MBP `api_server.py` onto mini when revisions diverge (`gateway.readiness` import broke mini 2026-07-13).
5. Upstream gaps to request from NousResearch/hermes-agent: config key for a session token/cost ceiling, per-session turn serialization in api_server (`max_concurrent_runs` is global only), and a circuit breaker that disables the failing tool for the session instead of only halting the turn. Also upstream `PUT /v1/toolsets/{name}` + `toolsets_write` capability for mobile.

---

## Related docs

- [MULTI-AGENT-VAULT-COORDINATION-JULY-2026.md](./MULTI-AGENT-VAULT-COORDINATION-JULY-2026.md)
- [ASC-REVIEW-DEMO.md](./ASC-REVIEW-DEMO.md)
- [RELEASE-SAFETY-NET.md](./RELEASE-SAFETY-NET.md)
- [AGENTS.md](../AGENTS.md)
- Vault: `~/Documents/AI-Agent-Sync/Handoffs/2026-07-10-prevent-recurrence.md`
