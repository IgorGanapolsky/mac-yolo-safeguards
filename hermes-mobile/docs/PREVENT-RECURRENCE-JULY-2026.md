# Prevent Recurrence — July 2026 Session Lessons

**Audience:** Igor's AI fleet (Cursor parent + workers, Claude Code, Codex, Gemini, Antigravity)  
**Companion:** [MULTI-AGENT-VAULT-COORDINATION-JULY-2026.md](./MULTI-AGENT-VAULT-COORDINATION-JULY-2026.md)  
**Last updated:** 2026-07-14

This document maps session failures to durable prevention: automated guards, process rituals, and vault coordination. One pass — no duplicate research subagents. **Do not fight P0 stall ChatScreen fixes** — layer prevention (utils, LaunchAgents, contracts) on top.

---

## Session failure checklist (2026-07-13/14) — failure → guard → verify

| # | Failure mode | Automated guard | Verify command |
|---|--------------|-----------------|----------------|
| S1 | Run/chat stalled while Connected (green Tailscale) | Mobile: `shouldAutoClearStalledRun` / stream-idle + no-token fail in `runStaleDetection.ts` (ChatScreen wires via P0 stall). Gateway: `scripts/hermes-prevention-watchdog.sh` reports stuck api runs. | `cd hermes-mobile && npm test -- --watchman=false src/__tests__/runStaleDetection.test.ts` |
| S2 | Mega-session / 100k–1.6M tokens locking chat | Hard BLOCK ≥500k + WARN ≥100k (`sessionTokenGuards.ts`); draft transfer via `transferComposerDraft`; delete/poisoned → Start fresh | `npm test -- --watchman=false src/__tests__/sessionTokenGuards.test.ts src/__tests__/composerDraftStorage.test.ts` |
| S3 | “Browser restrictions” / refusal menus | SOUL **No constraints**; `disabled_toolsets` must not include `browser`; CDP LaunchAgent `com.hermes.chrome-cdp` healed — never disable browser | `bash scripts/hermes-prevention-watchdog.sh --check`; `curl -sf http://127.0.0.1:9222/json/version` |
| S3b | CDP IPv4 squat / IPv6-only DevTools | Heal via `scripts/hermes-chrome-cdp.sh` (reclaim non-CDP `:9222` listeners, bind `127.0.0.1`) — never disable browser | `bash scripts/configure-browser-control.sh --status --json`; `curl -sf http://127.0.0.1:9222/json/version` |
| S4 | Leash badge 5557 / approval notif storm | `pendingApprovalsCap.ts` hard-cap + 99+ badge + signature dedupe (PR #279 wiring) | `npm test -- --watchman=false src/__tests__/pendingApprovalsCap.test.ts` |
| S5 | Tap-to-retry / Start fresh no feedback | Busy spinners mandatory (`isStartingFreshChat` → `ActivityIndicator` in ChatScreen + RunProgressBanner) | `npm test -- --watchman=false src/__tests__/preventRecurrenceContract.test.ts` |
| S6 | Parallel agents thrashing ChatScreen | `plan.md` single owner; no conflicting Start-fresh PRs; vault Handoffs | `node tools/plan-coordination-snapshot.js --json` |
| S7 | ASC duplicate screenshots | Pipeline `_assert_store_frame_distinct.py` + capture scripts; **never pull App Review to fix shots** | `python3 hermes-mobile/scripts/_assert_store_frame_distinct.py <frames-dir>` (or contract test) |
| S8 | False “shipped on phone” | `tools/require-device-verified.js` + `verify-continuous-e2e.sh --strict`; OTA/release proof before claims | `node tools/require-device-verified.js`; `bash hermes-mobile/scripts/verify-continuous-e2e.sh --strict` |
| S9 | Fresh install **Wrong key** (USB MBP / multi-Mac) | `assertHostKeyConsistency` + strict mini SSH (no laptop-key fallback) + auth probe before deep link; session-start fails closed if pair ≠0; `wrongKeyRecovery` → Find computers CTA | `bash tests/test-hermes-mobile-pair.sh`; `npm test -- wrongKeyRecovery.test.ts` |
| S10 | Header **Mini · USB** while cable is MBP / reconnecting | PRODUCT LAW in `chatMachineHeader.ts`: named `X · USB` only if live green\|amber `/health` hostname is X; null/red → `Computer via USB`; inverted unit tests (never borrow Mini on reconnect); `assertUsbHeaderIdentityLaw` | `npm test -- --watchman=false src/__tests__/chatMachineHeader.test.ts` — do **not** treat continuous `e2e=pass` (ship-guard) as multi-Mac proof |
| S11 | Pairing sent consecutive setup + dev-unlock intents with zero delay — could race a cold-starting app | `waitForForegroundAck` in `hermes-mobile-pair-lib.js`: one setup intent, poll app-foreground ack (bounded), then optional secondary; `--no-dev-unlock` to disable secondary entirely | `bash tests/test-hermes-mobile-pair.sh` |
| S12 | Pairing/install/Maestro/screenshots/dogfooding each fought for the USB phone — Maestro would even `kill -9` another lane's live session | `tools/agent-phone-lease.js` unified lease over `agent-phone-pipeline-lock.js`; automated lanes (`maestro`/`e2e`/`screenshots`/`dogfooding`) SKIP instantly on a human hold instead of queueing; `maestro-env.sh`'s `prepare_android_maestro_driver` refuses instead of force-killing when the lease is busy; `run-continuous-e2e.sh`'s `guard_system_pressure` skips E2E on lease-busy | `node tests/test-agent-phone-lease.js`; `node tools/agent-phone-lease.js status` |
| S13 | Deep link embedded the raw gateway API key in `hermes://setup?key=…` — lands in adb logs/shell history/screenshots | Secretless one-time pairing code (`putPairingCode`/`takePairingCode`, single-use + TTL) + `/pair-exchange` on the pair server; app exchanges via `pairingCodeExchange.ts` and persists via Android Keystore-backed `secureCredentials`; legacy embedded-key links still work when no server is running (`--no-serve`) | `bash tests/test-hermes-mobile-pair.sh`; `npm test -- --watchman=false src/__tests__/pairingCodeExchange.test.ts src/__tests__/setupDeepLink.test.ts` |
| S14 | Connection status collapsed to one boolean — an optional event-socket (WS) drop could red out an otherwise-healthy USB connection | `connectionStateMachine.ts`: ordered stages `usb_missing -> port_closed -> auth_failed -> connected`; the event socket is evaluated only after `connected` and surfaces the non-blocking `event_socket_optional` reason code, never a red state | `npm test -- --watchman=false src/__tests__/connectionStateMachine.test.ts` |
| S15 | Composer typing could theoretically be wired to run/send state, blocking the user from typing during an active run | `ChatInputBar.tsx`'s `TextInput.editable` is a static `true`, never derived from `sendDisabled`/`isSending`; regression tests lock the invariant so Send/Queue may be disabled but typing never is | `npm test -- --watchman=false src/__tests__/ChatInputBar.test.tsx` |
| S11 | Gibberish probe strings in Maestro/adb chat composer | Standing rule: device/E2E chat input is only **`make money today`**; `preventRecurrenceContract.test.ts` bans `typeableProbe*`, `e2e-*-probe*`, `smoke test message` in `.maestro/` chat flows | `npm test -- --watchman=false src/__tests__/preventRecurrenceContract.test.ts` |
| S16 | Secretless pair deep link regressed `pairCode=` back to relay `code=` (#392) | `buildSecretlessDeepLink()` in `tools/hermes-mobile-pair.js` always sets `pairCode`; `parseSetupDeepLink()` prefers it and only falls back to legacy `code=` when no `gatewayUrl` is present | `npm test -- --watchman=false src/__tests__/preventRecurrenceContract.test.ts src/__tests__/setupDeepLink.test.ts` |
| S17 | `--mini-tailscale` (AGENTS.md standing key-sync command) hijacked `pair.json`/USB primary while cabled to a different Mac (#393) | `usbHijackGuardTripped` gates on the **live cable fact** (verified loopback auth to `127.0.0.1:8642`), not just `--no-serve`; skips `pair.json` write + adb push; escape hatch `--force-mini-usb-primary` | `bash tests/test-hermes-mobile-pair.sh` |
| S18 | "Choose your computer" picker hid a freshly discovered, unnamed, never-connected Mac even though "Find computers" reported it (#389) | `profilesForSwitchComputerPicker()` only excludes phone-shaped hostnames as noise; every other discovered machine renders under a generic `Tailscale <ip>` label until naming resolves | `npm test -- --watchman=false src/__tests__/gatewayProfilePicker.test.ts src/__tests__/preventRecurrenceContract.test.ts` |
| S19 | "Repair link" could spin forever if `autoConnectGateway`/`retryGatewayBootstrap` hung (#392/#393); 12s also starved Tailscale pair-server credential refresh | `REPAIR_CONNECTION_TIMEOUT_MS = 30_000` + `runRepairGatewayLink` (pair-server credential refresh before reconnect); catalog `loadOps` is best-effort after heal; `ConnectionHealthHub`'s `finally { setRepairBusy(false) }` clears the spinner on both success and rejection | `npm test -- --watchman=false src/__tests__/ConnectionHealthHub.test.tsx src/__tests__/repairGatewayLink.test.ts src/__tests__/preventRecurrenceContract.test.ts` |
| S20 | Dead-run unlock cleared `isSending` but left `pinnedOutboundStatus==='pending'`, permanently graying Send (#384) | Dead-run unlock resets `pinnedOutboundStatus`/`pinnedOutboundText`/`pendingOutboundSendsRef`/`outboundQueueRef`; `shouldSurfaceDeadRunEnded` no longer gates on global `/v1/obsidian/agents` activity | `npm test -- --watchman=false src/__tests__/deadRunDetection.test.ts src/__tests__/preventRecurrenceContract.test.ts` |
| S21 | `adb reverse` for `tcp:8642`/`tcp:8765` silently dropped mid-session with no OS notification, stranding USB "Reconnecting…" (#388) | `tools/hermes-usb-reverse-watchdog.js` polls every authorized physical USB serial and re-applies any missing reverse using the same `hermes-mobile-pair-lib.js` helpers pairing uses; installed via `com.igor.hermes-usb-reverse-watchdog.plist` | `node tools/hermes-usb-reverse-watchdog.js --json` |
| S22 | A failed secretless pair exchange or relay-only pair wiped existing saved computers / forced `connectionMode: relay` over a healthy USB gateway (#394) | `evaluatePairDeepLinkApply()` never persists profiles/settings on a failed exchange; existing `gatewayProfiles` are kept and the user sees "your saved computers were kept" | `npm test -- --watchman=false src/__tests__/pairDeepLinkApply.test.ts src/__tests__/preventRecurrenceContract.test.ts` |
| S23 | Multi-Mac pairing risked binding the mini's URL to the MacBook Pro's `API_SERVER_KEY` (or vice versa) | `extraComputers[].apiKey` flows end-to-end from `buildDeepLink()` → `setupDeepLink.ts` → `syncExtraProfileApiKeys()` → per-profile `secureCredentials.saveProfileApiKey(profile.id, apiKey)`; `hermes-mobile-pair-lib.js`'s `MINI_KEY_UNAVAILABLE` guard refuses to fall back to the laptop key | `npm test -- --watchman=false src/__tests__/gatewayProfileCredentialSync.test.ts src/__tests__/preventRecurrenceContract.test.ts` |

**S24 — Tailscale route must not show "home Wi‑Fi" step 1 (in flight, PR #397):** `freshUserOnboardingSteps()` step 1 hardcoded "Same home Wi‑Fi" regardless of route, which is actively wrong for a user whose only working path is Tailscale. The Tailscale-first onboarding fix (`isOnTailscaleRoute()` + route-aware step 1 copy) is being delivered separately on `fix/tailscale-onboarding-discovery` (PR #397) with its own `freshUserOnboarding.test.ts` / `ChatConnectionPanel.test.tsx` / `setupDeepLink.test.ts` coverage — intentionally not duplicated here to avoid colliding with that in-flight branch. `.maestro/tailscale-profile-disconnected-copy.yaml` locks in the structural onboarding-card contract today and is the flow to extend with the exact step-1 copy assertion once PR #397 merges.

Install/heal LaunchAgents: `bash scripts/install-hermes-chrome-cdp.sh` then `bash scripts/install-agent-launchagents.sh`.

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
| 10 | Dual continuous E2E thrash + poisoned `latest.json` (2026-07-13) | Multiple agents ran `run-continuous-e2e.sh --once` + bare Maestro on same USB phone; worktree without `node_modules` wrote `unit:fail` / `e2e:skipped` over shared proof; vault handoff skipped | **`flock` cycle lock** on all continuous modes; refuse cycle if jest missing (**do not write** `latest.json`); skip E2E if `maestro.cli.AppKt` already holds device; vault claim USB/Maestro before kick; one continuous owner | **Automated lock + vault** |
| 11 | Fresh install → **Wrong key / Not connected** (2026-07-14) | Pair deep link embedded unverified or foreign `API_SERVER_KEY` (laptop key on mini, or extra Mac without SSH); USB used tailnet URL without reverse; `/health` green while chat 401 | **`verifyGatewayAuthSync` before deep link** (refuse if not 200); **USB primary → `127.0.0.1:8642`** when reverse auth works; **extras only with SSH key + verified auth**; never fallback laptop key onto mini when `fallbackLocal:false`; **auto-pair after `install-phone-release.sh`**; redact all keys in logs | **Automated pair-lib + install** |
| 12 | Bare **Aborted** in chat/banner (2026-07-14) | OpenCode/agent runtime error `Aborted` / AbortError leaked as UI copy | `isRawAbortMessage` + `USER_RUN_INTERRUPTED_MESSAGE` in chatErrors, runProgressDisplay, outbound bubbles, assistant prose | **Unit tests** |
| 13 | Wrong-key / Not connected after multi-agent dogfood (2026-07-14) | Locks lived **per worktree** (`hermes-mobile/.install-phone-release.lock`); 6+ agents built/paired the same USB phone; some reclaim paths deleted locks while another pipeline was live | **Global phone pipeline dir** `~/Library/Application Support/mac-yolo-safeguards/phone-pipeline/` for install flock + pair mutex + install marker + human hold; reclaim **only** dead PIDs; never force-delete a live holder | **Automated global lock** |
| 14 | Tonight's P0 cluster (2026-07-14 evening): pairCode/code param mismatch, `--mini-tailscale` USB hijack, picker hid a discovered Mac, Repair link risk of infinite spin, dead-run Send stayed grayed, adb reverse silently dropped mid-session, pair failure risked wiping saved computers | Each bug shipped its own fix + unit tests in isolation (PRs #392/#393/#389/#384/#388/#394) with no single release-blocking gate tying them together, so a future refactor could silently regress any one of them without a dedicated failing test | S16–S23 in the checklist above, consolidated as one `describe('tonight recurrence gates …')` block in `preventRecurrenceContract.test.ts` (release-blocking via `test:release-safety`) plus 3 new Maestro tier-0 flows (`tailscale-profile-disconnected-copy`, `picker-two-machines`, `pairCode-deep-link`) | **Consolidated unit contract + E2E** |

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
| Per-worktree install/pair locks | Concurrent install+pair on one USB → Wrong-key / stale profile | Global dir `phone-pipeline/` (override `HERMES_GLOBAL_PHONE_LOCK_DIR`); `tests/test-global-phone-pipeline-lock.sh` |
| `e2e=skipped` in `latest.json` not escalated | Ship theater | `verify-continuous-e2e.sh` warn + CEO brief flag when skipped >30m |
| No pre-commit on ASC note **draft files** in repo | Accidental commit of secrets in draft md | Optional: guard staged `*review*notes*` paths |
| Sim stale branding | Wrong splash on sim | Document: `xcrun simctl uninstall` + clean prebuild in install runbook |

---

## Quick reference scripts

| Script | When |
|--------|------|
| `bash scripts/agent-pre-asc-edit.sh` | Before any ASC review notes / App Review Information edit |
| `bash scripts/agent-adb-refresh.sh` | Session start, before pair, before "phone not connected" diagnosis |
| Global phone lock dir | `~/Library/Application Support/mac-yolo-safeguards/phone-pipeline/` — install flock + pair mutex + last-install marker; one pipeline per Mac |
| `node scripts/verify-asc-listing.js` | ASC status audit; fails on unsafe live notes |
| `node scripts/patch-asc-review-notes.js` | Apply safe template via API (preferred) |
| `node tools/hermes-mobile-pair.js --mini-tailscale` | Multi-Mac — never laptop key on mini URL |
| `bash scripts/install-hermes-chrome-cdp.sh` | Install/heal `com.hermes.chrome-cdp` (port 9222) |
| `bash scripts/configure-browser-control.sh --apply --json` | Real-user browser-control status + heal (see `docs/BROWSER-CONTROL.md`) |
| `bash scripts/hermes-prevention-watchdog.sh` | CDP + SOUL + disabled_toolsets + token ceiling drift check |
| `node tools/require-device-verified.js` | Before any "shipped on phone" / device UX claim |
| `bash tests/test-hermes-mobile-pair.sh` | Multi-Mac host→key bind + session-start fail-closed |
| `node tools/hermes-mobile-pair.js --no-serve` | Fresh install pair (strict mini SSH; refuses laptop key on mini URL) |
| `node tools/agent-phone-lease.js status` / `hold --reason TEXT` / `release` | Unified phone lease — check/set/clear a human hold before letting an automated lane (Maestro/E2E/screenshots/dogfooding) touch the USB phone |

---


---

## Dual continuous E2E thrash (2026-07-13)

**Symptom:** Two+ `run-continuous-e2e.sh --once` (or agent Maestro + continuous) on `R3CY90QPM7E` → ADB offline, ship-guard attempt 1/2 fail, `latest.json` flips to `unit:fail` from a worktree without Jest.

**Hard rules:**

1. **One continuous cycle at a time** — `run-continuous-e2e.sh` takes `flock` on `~/Library/Logs/hermes-mobile-continuous-e2e.lock` for `--once`/`--daemon`/`--watch`. Second instance prints "cycle lock busy" and **exits 0 without writing** `latest.json`.
2. **Never continuous from a worktree without `node_modules`** — missing Jest used to write `unit:fail` and block honest E2E. Script now refuses and does not poison the proof file.
3. **If `maestro.cli.AppKt` is already running**, continuous skips E2E (unless `HERMES_E2E_FORCE=1`) after a short wait — do not stack drivers on the phone.
4. **Vault first:** before kicking continuous or USB Maestro, write `Handoffs/` + claim device lane in your Agent-State file. Other agents must not start a second continuous while lock/holder is live.
5. **Ship claims:** only when main `hermes-mobile/docs/proofs/continuous/latest.json` has `e2e: "pass"` — not a solo Maestro log alone.

## Mega-session / compaction thrash (2026-07-13)

**Symptom class:** 1.7M+ token Hermes Mobile chats → compaction stubs ("Earlier conversation summarized to save context"), no real reply, Retry theater, missing prompts.

| Layer | Gate | Location |
|-------|------|----------|
| WARN | ≥ 100k tokens — banner + confirm before Send; Recents suggest fresh on open | `sessionTokenGuards.ts` `MEGA_SESSION_TOKEN_WARN` |
| BLOCK | ≥ 500k tokens — **hard-block Send** (no Send anyway); composer muted; Recents "Too large" forces Start fresh | `MEGA_SESSION_TOKEN_BLOCK` + `ChatScreen` / `RecentChatsList` |
| Compaction stall | Summarization-only assistant turn → keep polling + auto-offer Start fresh once | `chatCompactionHandoff.ts` + `ChatScreen` |
| Unit | `shouldAllowMegaSessionSend`, thresholds, recents badge | `sessionTokenGuards.test.ts`, `chatCompactionHandoff.test.ts`, `RecentChatsList.test.tsx` |

**Operator rules (Igor):**

1. Prefer **Start fresh chat** when a thread crosses ~100k or shows a summarization stub — do not keep Retrying.
2. Never reopen a **Too large** recent expecting a reply; fork first.
3. Do not raise `MEGA_SESSION_TOKEN_BLOCK` back toward 800k without a proven gateway-side refuse.
4. Gateway note: Hermes gateway does not yet refuse continue-by-token; mobile hard-block is the product gate. If adding gateway refuse later, mirror the 500k threshold.
5. After any mega-session UX change: focused Jest on the three files above + kick continuous E2E; do not claim fixed while `latest.json` `e2e=skipped`.

Shipped hardening: PR #151 (initial unblock), #186 (stall CTA + WARN 350k), T-186 (BLOCK 800k + auto-offer + recents force-fresh).

---

## Desktop gateway token burn (2026-07-13, session `api_1783962481`)

**Incident:** 833k input tokens burned on the mini before the session was deleted. Root cause: dead CDP browser tool (`browser.cdp_url=ws://localhost:9222` but the `com.hermes.chrome-cdp` LaunchAgent was disabled 2026-06-29; 9222 held by plain Chrome, `/json/version` 404) failed ~30 consecutive calls while ~26k tokens of pinned context were re-sent on every call (nemotron, 40k window), two asyncio turns ran concurrently on the same session, and no session-level token ceiling existed.

**Guardrails now live on both Macs (`~/.hermes/config.yaml`, backups `.bak-20260713-token-burn-guardrails`):**

| Guardrail | Setting | Machine |
|-----------|---------|---------|
| Same-tool failure circuit breaker | `tool_loop_guardrails.hard_stop_enabled: true`, `hard_stop_after.same_tool_failure: 5`, `exact_failure: 4` | both |
| Serialize api_server turns | `gateway.api_server.max_concurrent_runs: 1` (mini) / `2` (MBP) | both |
| Session input-token ceiling | `HERMES_MAX_SESSION_INPUT_TOKENS` env, default **500k** (0 disables) — local patch in `~/.hermes/hermes-agent/agent/conversation_loop.py` | both |
| CDP + SOUL drift | LaunchAgent `com.hermes.chrome-cdp` + `com.igor.hermes-prevention-watchdog` (heal CDP; refuse `disabled_toolsets: [browser]`) | both |

**REVERSED (2026-07-13 evening — user standing order: no constraints):** temporarily setting `agent.disabled_toolsets: [browser]` after dead CDP was rejected. Browser stays **enabled**. If CDP dies, **heal CDP** — never encode breakage as a permanent tool/SOUL constraint.

| Browser restore | Setting / proof |
|-----------------|-----------------|
| Chrome CDP LaunchAgent | `com.hermes.chrome-cdp` → `~/.hermes/chrome-cdp-profile`, port `9222`, `--remote-allow-origins=*` |
| Config | `disabled_toolsets: []`, `browser.cdp_url: ws://127.0.0.1:9222` (or empty + engine auto with healthy CDP) |
| SOUL | **No constraints** section; never reinstate `Browser Session Safety Lock` / `uchg` |
| Vault | `Agent-Directives/NO-CONSTRAINTS-FLEET-POLICY.md` |
| Watchdog | `bash scripts/hermes-prevention-watchdog.sh` every 5m |

**REVERSED (2026-07-13 evening — user standing order: no constraints):** temporarily setting `agent.disabled_toolsets: [browser]` after dead CDP was rejected. Browser stays **enabled**. If CDP dies, **heal CDP** — never encode breakage as a permanent tool/SOUL constraint.

| Browser restore (verified 2026-07-13) | Setting / proof |
|--------------------------------------|-----------------|
| Chrome CDP LaunchAgent | `com.hermes.chrome-cdp` → `~/.hermes/chrome-cdp-profile`, port `9222`, `--remote-allow-origins=*` |
| Config | `disabled_toolsets: []`, `browser.cdp_url: ws://127.0.0.1:9222` |
| Toolsets API | `browser` / `computer_use` / `web` `enabled=true` |
| SOUL | **No constraints** section; `Browser Session Safety Lock` purged (had `uchg` — clear with `chflags nouchg` before edit) |
| Vault | `Agent-Directives/NO-CONSTRAINTS-FLEET-POLICY.md`; `BROWSER-SESSION-SAFETY-LOCK.md` retired |
| Probe | Gateway chat navigated `https://example.com` → title `Example Domain`; no restriction/menu copy |

**Operator rules:**

1. CDP health: `curl -s http://127.0.0.1:9222/json/version` must return 200. If not, restart `com.hermes.chrome-cdp` (or relaunch Chrome with the hermes profile flags) — **do not** disable the browser toolset or add SOUL lock language.
2. Never set `uchg` on `~/.hermes/SOUL.md`. Never reinstate `Browser Session Safety Lock`.
3. Never narrate "browser automation restrictions" or dump numbered workaround menus on the user — fix tools and continue.
4. The 500k desktop ceiling aligns with the mobile BLOCK gate (500k) — keep WARN (100k) under BLOCK if any threshold moves.
5. `~/.hermes/hermes-agent` is a **git fork checkout** (IgorGanapolsky/hermes-agent), not pip site-packages — patch + commit there, and remember `hermes update` may stash local changes (`updates.non_interactive_local_changes: stash`).
6. Upstream gaps to request from NousResearch/hermes-agent: config key for a session token/cost ceiling, per-session turn serialization in api_server (`max_concurrent_runs` is global only), and a circuit breaker that disables the failing tool for the session instead of only halting the turn.
7. Poisoned mega-sessions may still contain old restriction turns — use **Start fresh chat**; policy alone does not rewrite history.

## Safety-timeout / gateway inactivity kill (2026-07-14, session `final-green-205443`)

**Symptom:** Phone shows raw `Safety timeout interrupted further progress. Resume with hermes continue` on a 399k-token mega session while Connected to Igors-Mac-mini.

| Layer | Root cause | Fix |
|-------|------------|-----|
| Gateway | `agent.gateway_timeout: 900` (15 min **inactivity** kill) on mini + MBP | `scripts/hermes-fleet-no-timeout.sh --fleet` sets `gateway_timeout: 0`, `gateway_timeout_warning: 0`, `HERMES_MAX_SESSION_INPUT_TOKENS=0`, `HERMES_AGENT_TIMEOUT=0` in gateway plist |
| Agent fork | `conversation_loop.py` session input ceiling default 500k | Env `HERMES_MAX_SESSION_INPUT_TOKENS=0` disables |
| Phone UX | Raw safety-timeout copy from poisoned mega-session history / model paraphrase | `safetyTimeoutRecovery.ts` + `humanizeAssistantProse` → human copy; auto-`continue` helper |
| Phone timers | `MEGA_SESSION_RUN_STALE_AUTO_FAIL_MS` was 10 min (shorter than normal 20 min) | Mega sessions now use same 20 min client fail as normal runs; stream idle no longer halved for mega |

**Operator rules:**

1. Run `bash scripts/hermes-fleet-no-timeout.sh --fleet --probe` after any gateway timeout regression.
2. Never reintroduce `gateway_timeout: 900` without Igor explicit ask — standing order is **no timeouts**.
3. Mega sessions: **Start fresh chat** still recommended at 100k+; draft transfer preserved (T-268).
4. Unit tests: `safetyTimeoutRecovery.test.ts`, `chatAssistantProse.test.ts`, `runStaleDetection.test.ts`.

---

## Related docs

- [MULTI-AGENT-VAULT-COORDINATION-JULY-2026.md](./MULTI-AGENT-VAULT-COORDINATION-JULY-2026.md)
- [ASC-REVIEW-DEMO.md](./ASC-REVIEW-DEMO.md)
- [RELEASE-SAFETY-NET.md](./RELEASE-SAFETY-NET.md)
- [AGENTS.md](../AGENTS.md)
- Vault: `~/Documents/AI-Agent-Sync/Handoffs/2026-07-10-prevent-recurrence.md`
