# Changelog

All notable changes to this project will be documented here. Format loosely follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Notify-only orphaned-CDP-Chrome detector** (`sim-runaway-guard.sh`). Closes a gap exposed on 2026-06-04: the Mac mini froze (memory thrash) because a browser-automation session launched Chrome with `--remote-debugging-port=9222 --user-data-dir=/tmp/chrome_cdp_profile_<epoch>` and the launcher then exited, leaving the browser running, reparented to `launchd` (PID 1) — one leaked instance is ~1 main proc + ~22 helper children holding gigabytes. The shipped guard never warned (the memory branch keys on AI-agent process names like `agy|claude|cursor`, not Chrome). The new branch:
  - **Counts distinct orphaned instances** by unique `/tmp/chrome_cdp_profile_<n>` profile dirs — measured from MAIN browser procs (command contains `chrome_cdp_profile` **and not** `--type=`) whose `ppid==1` — never raw process count (one browser is ~23 procs; raw count is misleading). RSS is summed across all procs (main + helpers) sharing each orphaned profile so the reported footprint is the true memory held.
  - **Notifies only** (debounced once per ~30 min via `/tmp/yolo-cdp-last`, configurable with `YOLO_CDP_NOTIFY_DEBOUNCE_SEC`), gated on the same low-free-memory condition (<15% free) as the existing soft memory-pressure check so it only fires when the leak actually matters. The notification states the instance count and approximate GB and that the kit does not kill them.
  - **Never kills, quits, or signals Chrome** — consistent with the browser hard rule. Clearing the leak is the user's call.
- **`yolo-health` informational line** reporting the count of orphaned CDP Chrome instances, purely informational and consistent with the existing "kit does NOT manage general Mac memory" framing.

### Changed

- Replaced the low-ACV "$99 onboarding" funnel with a paid AI-agent reliability offer ladder: $499 diagnostic, $1,500 hardening sprint, and $3,000 partner pilot. Added `AI-AGENT-HARDENING.md` and `REVENUE-OPERATING-PLAN.md` so the public repo points qualified team and agency buyers toward offers that can plausibly support the $300/day after-tax revenue target.
- Added `SALES-CLOSE-KIT.md` with qualification scoring, discovery questions, offer scripts, proposal language, payment workflow, delivery checklists, objections, and close evidence so paid work is not counted until Stripe payment clears.
- Added `tools/revenue-net.js` plus `revenue-ledger.example.tsv` to make the $300/day after-tax target mechanically verifiable from cleared payments, fees, refunds, and tax reserve. Real `revenue-ledger*.tsv` files are gitignored so private buyer/payment records do not land in the public repo.
- Added `tools/prospect-score.js` plus `prospects.example.tsv` to route outreach prospects to free, diagnostic, sprint, or partner-pilot offers using the same 10-point qualification model as `SALES-CLOSE-KIT.md`. Real `prospects*.tsv` files are gitignored.
- Added `tools/outreach-queue.js` to join scored prospects, private contact sheets, and private outreach drafts into ignored `send-queue*.tsv` files. This makes the send-ready state mechanically checkable without committing prospect-specific contact data.
- Added `tools/outreach-actions.js` to turn ignored send queues into ignored manual action lists with encoded `mailto:` links and booking-form URLs. The tool prepares outreach without sending external messages.
- Added `tools/send-plan.js` to combine manual action links, draft text, Stripe readiness annotations, optional Stripe-status filtering, and exact post-send pipeline update commands into ignored private `send-plan*.md` files.
- Added `tools/pipeline-init.js` to initialize ignored private pipeline trackers from ready send queues before manual outreach.
- Added `tools/pipeline-update.js` to move private pipeline rows through ready, sent, replied, booked, proposed, paid, and lost without hand-editing TSVs.
- Added `tools/proposal-plan.js` to generate ignored private proposal/payment handoffs with Stripe price readiness, Stripe checklist, pipeline commands, and revenue-ledger row templates. Private `stripe-offer*.tsv` maps are ignored.
- Added `tools/payment-readiness.js` to summarize which open private pipeline dollars have ready Stripe prices versus missing payment setup.
- Added `tools/pipeline-summary.js` plus `pipeline-status.example.tsv` for post-send stage tracking across ready, sent, replied, booked, proposed, paid, and lost. The summary tool accepts one or more pipeline trackers. Real `pipeline-status*.tsv` files are gitignored and paid pipeline rows still need revenue-ledger verification.
- Fixed yolo notification click behavior for LaunchAgents with a minimal `PATH`: the guard now checks Homebrew's absolute `terminal-notifier` paths and opens status files with TextEdit. The osascript fallback no longer asks the user to click a notification that macOS routes to a blank Script Editor window.

## [0.3.0] — 2026-06-02

Closes a real gap exposed by two back-to-back freezes the guard did NOT catch. On 2026-06-01 Antigravity's securecoder `semgrep-core-proprietary` scanner pegged a full core at 100% CPU on a scratch dir; on 2026-06-02 (post-reboot storm) Antigravity's `github.vscode-codeql` scanner did the same as a generic `java` process. Both were invisible to the existing guard: the sim branch only fires on >50 simruntime procs, and the memory branch keys on RSS, not CPU. Neither is a simulator, neither is a memory hog — so nothing fired, and the user had to ping an agent to kill them by hand.

### Added

- **CPU-runaway guard for non-simulator processes** (`sim-runaway-guard.sh`). Every 60s it evaluates *every* user-owned process at/above `YOLO_CPU_PCT_THRESHOLD` (default 150% CPU) — not just the #1 hog, so a runaway hiding behind a busy editor is still caught. Safe-by-default:
  - **Auto-kills** a process only if it is a known-safe, stateless background helper — either its executable basename matches `YOLO_CPU_AUTOKILL_PATTERNS` (default: `semgrep-core-proprietary|semgrep-core|crashpad_handler|crash_handler`) **or** its full command line matches `YOLO_CPU_AUTOKILL_CMD_PATTERNS` (default: `com.semmle.cli2.CodeQL`, for interpreter-hosted scanners whose basename — `java` — is too generic to allowlist safely) — **and** it has stayed hot for `YOLO_CPU_SUSTAINED_FIRES` (default 2) consecutive checks, so a brief compile/scan spike is never killed. Streaks are tracked per-PID.
  - **Everything else** over threshold — editors, dev servers, anything unknown — is **notify-only**, consistent with the existing "never auto-kill GUI apps" hard rule.
  - Process names are resolved from `ps -o comm=` (whole-path string, robust to executable paths containing spaces); the basename allowlist is anchored to the executable, never a path/arg substring.

### Fixed

- **Notifications opened a blank Script Editor instead of being actionable** (the 2026-06-02 "what the fuck is this?" report). `osascript -e "display notification"` is owned by Script Editor, so clicking such a notification launches an empty Script Editor window. The shared `notify()` helper now prefers `terminal-notifier` (registers as a proper sender; click runs `-execute "open -t <status-file>"`) and only falls back to osascript when terminal-notifier is absent. The CPU branch now passes its status file through so a click opens the actionable report.

### Changed

- **Consolidated notification logic.** The memory branch's inline terminal-notifier/osascript block was duplicated logic; it now calls the unified `notify()` helper (which gained an optional third `OPEN_FILE` arg). One notification path, not two.

### Verified by

- `sh -n` clean.
- `notify()` extracted and run against a fake `terminal-notifier` on PATH → confirmed it invokes `-execute "open -t …"` (click opens the status file, not Script Editor).
- End-to-end test of the extracted CPU branch against **real CPU-burning spinners** (symlinks to `/usr/bin/yes` — copies of signed system binaries are killed by codesign, symlinks are not; `python3` for the signature case): streak gate holds at check 1 (streak=1, nothing killed), then at check 2 (streak=2) the basename case (`semgrep-core`) and the signature case (CodeQL) are both killed while a non-allowlisted `myeditor` survives. The same run also auto-killed a **real** Antigravity CodeQL `java` process (PID 11297, 72% CPU) that happened to be live — proof on the actual real-world culprit.
- Live LaunchAgent ran the edited script across the incident with zero shell errors; `yolo-health` 12/12.

### Surfaced by

User pushback ("are you sure?" — twice) plus a screenshot of the useless osascript notification opening Script Editor, during a real reboot-storm freeze. Lessons: (1) a guard scoped to one failure mode (simulators) silently misses adjacent ones (CPU-bound scanners); (2) `osascript` notifications are not clickable-actionable and must not be the delivery path; (3) test spinners must use signed binaries — copied system binaries die to codesign and produce false-positive "kills".

## [0.2.4] — 2026-05-27

Critical fix for a self-heal infinite loop introduced by the v0.2.0 portability refactor. Affected every install since v0.2.0: the LaunchAgent's self-heal check tested `[ -L plist ]` (expecting a symlink) but v0.2.0 changed install.sh to RENDER the plist (substitute `{{HOME}}` placeholder), making it a regular file. The `-L` test failed every 60s → `install.sh` re-ran → `launchctl bootout` + `bootstrap` → agent state thrashed → `yolo-health` flapped between 12/12 and 10/12.

### Fixed

- `sim-runaway-guard.sh`: self-heal plist check uses `[ -f ]` (file exists) instead of `[ -L ]` (is symlink). Symlink checks on `yolo-health` and `agy-yolo-wrapper.js` remain correct — those *are* symlinks. Verified by logging SELF-HEAL count to `/tmp/shutdown-simulators.log` across a 70-second LaunchAgent cycle post-fix: 0 new entries (vs. firing every 60s before the fix).

### Surfaced by

User pushback ("are you sure?" three times in a row on the v0.2.3 verification). First-pass verification showed yolo-health 12/12; second-pass caught the flapping; third-pass found the install-loop as root cause. Adding this as a documented lesson: *runtime state (launchctl-managed services) can drift between verifications even when the disk state looks correct.*

## [0.2.3] — 2026-05-27

Notification actually renders now. Triggered by user screenshot showing the v0.2.2 notification body collapsed to just "Notification" — a known macOS regression where shell-script-issued `osascript display notification` calls drop the body for unregistered senders.

### Fixed

- **Notification body now visible.** The memory-pressure path detects `terminal-notifier` (Homebrew package) and uses it when present. `terminal-notifier` registers itself as a proper sender, so title + subtitle + body all render. **Click → opens `/tmp/yolo-status.txt`** via `-execute "open -t ..."`.
- **osascript fallback now actionable.** When `terminal-notifier` isn't installed, the fallback crams the agent name + RSS + kill command into the *title* (which macOS always shows) so even compact banners are useful: `yolo-guard: Cursor 887MB · kill -INT 1172`.
- **Honest ThumbGate cross-promo copy.** The v0.2.2 status-file blurb claimed "automated budget limits & live safety-gates" — ThumbGate doesn't do that. Rewrote to match ThumbGate's actual product: "ThumbGate captures one thumbs-down → blocks that exact mistake on every future call. PreToolUse gates, not budget limits." False claims in our copy degrade trust when readers click through and see something different.

### Recommended optional dependency

```sh
brew install terminal-notifier
```

The kit works without it (osascript fallback), but the notification UX is markedly better with it installed. Not required.

## [0.2.2] — 2026-05-27

Monetization and business alignment. Integrates the ThumbGate SaaS conversion funnel directly into system alerts and status reports to protect users from API token loops, supporting our $300/day daily profit target.

### Added

- `sim-runaway-guard.sh`: Organic budget protection recommendation. Added a contextual alert within the memory pressure status report (`/tmp/yolo-status.txt`) to protect users from API token runaway by introducing ThumbGate's automated budget gates (👉 https://thumbgate.ai).

## [0.2.1] — 2026-05-27

Notification UX fixes triggered by user feedback that clicking a memory-pressure notification opened Finder with nothing useful — a known macOS limitation of shell-issued `osascript display notification` (no delegate is registered, so clicks fall through to the script's parent).

### Changed

- **Notification body is now self-sufficient.** Title includes the agent name + RSS + PID. Body has the exact `kill -INT <pid>` command and a path to the status file. No click needed.
- **New `/tmp/yolo-status.txt`** generated on every memory-pressure fire. Human-readable report listing the top hog, all AI processes >200 MB, four recommended actions (soft restart, hard kill, inspect, run yolo-health), and a pointer to the hard rule about not auto-killing GUI apps. Path configurable via `YOLO_STATUS_FILE`.

### Fixed

- **Case-insensitive AI process matching.** Previous awk regex was lowercase-only and silently skipped `Cursor`, `Claude`, `Antigravity` (capitalized binary names when the process command is a `/Applications/...` path). Now uses `tolower(name) ~ /agy|claude|cursor|antigravity|codex/`. This was the actual reason the memory-pressure notification rarely fired in practice on real workloads.

### New env var

| Var | Default |
|---|---|
| `YOLO_STATUS_FILE` | `/tmp/yolo-status.txt` |

## [0.2.0] — 2026-05-27

Structural portability refactoring to eliminate all five hardcoded user paths. This ensures the kit can be installed, run, and self-healed on any macOS developer workstation out of the box, without hardcoding usernames or workspace directories.

### Added

- `install.sh`: Dynamic `antigravity-cli` path detection. It now scans `~/workspace` for custom layout patterns to locate `antigravity-cli` and links the wrapper there.
- `install.sh`: Plist placeholder rendering. Subsitutes a new `{{HOME}}` placeholder in the LaunchAgent plist with the actual absolute path to the user's home directory upon installation.

### Changed

- `com.igor.shutdown-simulators.plist`: Swapped the hardcoded user path with a dynamic `{{HOME}}` placeholder.
- `sim-runaway-guard.sh`: Dynamically resolves its own repo root folder using the symlink target path, and utilizes dynamic user layout detection for the self-heal process, completely preventing the infinite re-installation loop bug for non-default users.
- `agy-yolo-wrapper.js`: Dynamically resolves the `status.json` desktop control plane path and `agy` executable path using native Node.js `os` and `path` modules.
- `yolo-health`: Refactored all health-checks to use dynamic layout paths, matching the installer's detection logic.

## [0.1.1] — 2026-05-27

Soft memory-pressure surfacing + explicit scope documentation. Triggered by a user report that CleanMyMac was raising memory alerts and a need to verify the kit was working — diagnosis confirmed the kit was working as designed (load 3, sim_procs 0, 12/12 health) but the kit had no way to *surface* high-but-orthogonal memory pressure to the user.

### Added

- `sim-runaway-guard.sh`: memory-pressure soft check. When system free memory < 15% **and** an AI agent process (`agy`, `claude`, `cursor`, `antigravity`, `codex`) exceeds 1500 MB RSS, the guard posts a macOS notification once per 30 min (debounced). **Never kills the process.** New env vars:
  - `YOLO_MEM_FREE_PCT_THRESHOLD` (default `15`)
  - `YOLO_MEM_PROC_RSS_MB_THRESHOLD` (default `1500`)
  - `YOLO_MEM_NOTIFY_DEBOUNCE_SEC` (default `1800`)
  - `YOLO_MEM_LAST_FILE` (default `/tmp/yolo-mem-last`)
- `yolo-health`: new informational "Memory state" section. Shows free memory % and top 3 AI process memory hogs. Does not affect pass/fail count (informational only).
- `README.md`: new "What this does NOT do" section spelling out the kit's narrow scope — does not manage general Mac memory, never kills GUI apps, doesn't stop AI agents from being normally memory-hungry, macOS-only, no telemetry.
- `README.md`: new "Guard configuration" env-var table.

### Unchanged

Hard rule still holds: **the kit never auto-kills GUI apps**. The new memory-pressure check is notify-only. The escalation path remains a critical macOS alert. Anyone running an AI agent that legitimately uses 1+ GB RAM gets one toast per 30 min and that's it.



## [0.1.0] — 2026-05-27

First public release. Hardened from the 2026-05-26 incident (load average 307, 256+ runaway `simruntime` processes triggered by `agy --dangerously-skip-permissions`).

### Added

- `agy-yolo-wrapper.js` — drop-in wrapper around `agy --dangerously-skip-permissions`. Adds:
  - Singleton lock at `/tmp/agy-yolo.lock` (env-overridable via `AGY_YOLO_LOCK_PATH`)
  - 30-minute hard timeout (env-overridable via `AGY_YOLO_TIMEOUT_MS`)
  - Stuck-loop watchdog: kills the agent after N consecutive 30-second samples above 80% CPU (defaults: 4 samples = 2 minutes)
  - Spawn-error handler (exits 127 on missing binary instead of crashing)
  - `--sandbox` flag wired in by default (override with `AGY_YOLO_NO_DEFAULT_ARGS=1`)
  - Exit codes: 0 clean, 1 signal, 2 singleton-blocked, 124 timeout/watchdog, 127 spawn error.
- `sim-runaway-guard.sh` — LaunchAgent-driven guard that runs every 60s. Triggers when:
  - `load > 30 AND sim_procs > 50` (CPU runaway), OR
  - `sim_mem > 50% AND sim_procs > 50` (memory hog)
  - Shuts down booted simulators via `xcrun simctl shutdown all` + `killall -9 Simulator`.
  - Escalation after 3 fires in 10 min: shows a critical macOS alert. **Never auto-quits GUI apps.**
  - Self-healing: re-runs `install.sh` if symlinks go missing.
- `com.igor.shutdown-simulators.plist` — LaunchAgent (`StartInterval=60`, `RunAtLoad=true`).
- `yolo-health` — 12-point installer + verifier (script presence, wrapper safeguards, LaunchAgent loaded, periodicity, live Mac state).
- `install.sh` — idempotent installer creating symlinks at install targets pointing back to this repo.
- `CASE-STUDY.md` — full 2026-05-26 incident write-up with reproducible evidence (12/12 health checks, load trajectory 307 → 24).
- `LICENSE` — MIT.

### Design rules

- **Never auto-quit GUI apps.** Foreground apps (Antigravity, Cursor, Xcode, Ghostty, Android Studio, IDEs, browsers) have unsaved work. An earlier draft auto-quit Antigravity IDE on escalation — removed after the operator's pushback. The guard notifies; the human decides.
- **No telemetry.** All logs land in `/tmp` and are gitignored.
- **Symlinks-only install.** Uninstall = `rm` four files. No global modifications.

### Verified on

- Darwin 25.5.0, Apple Silicon (M-series).
- Wrapper test suite: 5/5 passing.
- `yolo-health`: 12/12 passing at v0.1.0 tag.

[Unreleased]: https://github.com/IgorGanapolsky/mac-yolo-safeguards/compare/v0.3.0...HEAD
[0.3.0]: https://github.com/IgorGanapolsky/mac-yolo-safeguards/releases/tag/v0.3.0
[0.2.4]: https://github.com/IgorGanapolsky/mac-yolo-safeguards/releases/tag/v0.2.4
[0.2.3]: https://github.com/IgorGanapolsky/mac-yolo-safeguards/releases/tag/v0.2.3
[0.2.2]: https://github.com/IgorGanapolsky/mac-yolo-safeguards/releases/tag/v0.2.2
[0.2.1]: https://github.com/IgorGanapolsky/mac-yolo-safeguards/releases/tag/v0.2.1
[0.2.0]: https://github.com/IgorGanapolsky/mac-yolo-safeguards/releases/tag/v0.2.0
[0.1.1]: https://github.com/IgorGanapolsky/mac-yolo-safeguards/releases/tag/v0.1.1
[0.1.0]: https://github.com/IgorGanapolsky/mac-yolo-safeguards/releases/tag/v0.1.0
