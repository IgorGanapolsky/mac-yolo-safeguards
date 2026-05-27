# Changelog

All notable changes to this project will be documented here. Format loosely follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[Unreleased]: https://github.com/IgorGanapolsky/mac-yolo-safeguards/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/IgorGanapolsky/mac-yolo-safeguards/releases/tag/v0.1.0
