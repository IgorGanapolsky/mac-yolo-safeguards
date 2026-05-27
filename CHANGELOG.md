# Changelog

All notable changes to this project will be documented here. Format loosely follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[Unreleased]: https://github.com/IgorGanapolsky/mac-yolo-safeguards/compare/v0.2.3...HEAD
[0.2.3]: https://github.com/IgorGanapolsky/mac-yolo-safeguards/releases/tag/v0.2.3
[0.2.2]: https://github.com/IgorGanapolsky/mac-yolo-safeguards/releases/tag/v0.2.2
[0.2.1]: https://github.com/IgorGanapolsky/mac-yolo-safeguards/releases/tag/v0.2.1
[0.2.0]: https://github.com/IgorGanapolsky/mac-yolo-safeguards/releases/tag/v0.2.0
[0.1.1]: https://github.com/IgorGanapolsky/mac-yolo-safeguards/releases/tag/v0.1.1
[0.1.0]: https://github.com/IgorGanapolsky/mac-yolo-safeguards/releases/tag/v0.1.0
