# mac-yolo-safeguards

Safety net for running AI coding agents (Antigravity `agy`, Claude Code, Codex) in YOLO mode on macOS without freezing the Mac.

## Background

On 2026-05-26 an iPhone 17 simulator was auto-booted (first by macOS window restoration, later by Antigravity's `agy` agent running with `--dangerously-skip-permissions`) and slammed the Mac to load average **307** with 256+ simulator runtime processes. This repo holds the safeguards that prevent recurrence.

## Contents

| File | Installs to | Purpose |
|---|---|---|
| `agy-yolo-wrapper.js` | `~/workspace/git/igor/antigravity-hub/antigravity-cli/bin/` | Hardened wrapper around `agy --dangerously-skip-permissions`. Adds singleton lock, hard timeout, stuck-loop watchdog, spawn-error handling, and `--sandbox`. |
| `sim-runaway-guard.sh` | `~/.local/bin/` | Threshold-checking script. Shuts down booted simulators when load>30 with >50 sim procs (CPU runaway) OR sim_mem>50% with >50 sim procs (memory hog). |
| `com.igor.shutdown-simulators.plist` | `~/Library/LaunchAgents/` | LaunchAgent that runs the guard script every 60 seconds. |
| `yolo-health` | `~/.local/bin/` | Health-check that verifies all safeguards are installed and active. Run anytime: `yolo-health` |

All four files install as **symlinks** pointing back to this repo so edits land in one canonical place.

## Install on a fresh Mac

```sh
git clone <this repo> ~/workspace/git/igor/mac-yolo-safeguards
cd ~/workspace/git/igor/mac-yolo-safeguards
./install.sh
```

`install.sh` creates the symlinks and bootstraps the LaunchAgent. It is idempotent — safe to re-run.

## Wrapper configuration (env vars)

| Var | Default | Effect |
|---|---|---|
| `AGY_BIN` | `~/.local/bin/agy` | Override the agy binary path (useful for tests). |
| `AGY_YOLO_TIMEOUT_MS` | `1800000` (30 min) | Hard kill after N ms. |
| `AGY_YOLO_CPU_SAMPLE_MS` | `30000` (30 s) | Watchdog sample interval. |
| `AGY_YOLO_CPU_THRESHOLD` | `80` | %CPU above which a sample counts as "high". |
| `AGY_YOLO_CPU_STUCK_SAMPLES` | `4` | Consecutive high-CPU samples that trigger a stuck-loop kill (default: 4 × 30s = 2 min, matching Antigravity Lab's documented heuristic). |
| `AGY_YOLO_LOCK_PATH` | `/tmp/agy-yolo.lock` | Singleton lock path (override for tests). |
| `AGY_YOLO_LOG_PATH` | `/tmp/agy-yolo.log` | Wrapper log path (override for tests). |
| `AGY_YOLO_NO_DEFAULT_ARGS` | unset | If set, don't auto-add `--sandbox --dangerously-skip-permissions`. |

## Wrapper exit codes

| Code | Meaning |
|---|---|
| 0 | agy exited cleanly |
| 1 | wrapper killed by SIGINT/SIGTERM/SIGHUP |
| 2 | another agy-yolo is already running (singleton lock) |
| 124 | killed by hard timeout or stuck-loop watchdog |
| 127 | failed to spawn agy binary |
| other | propagated from agy |

## Tests

The wrapper has a 5-test verification suite. To re-run from this directory:

```sh
WRAPPER=./agy-yolo-wrapper.js
export AGY_YOLO_LOCK_PATH=/tmp/yolo-test-$$.lock AGY_YOLO_LOG_PATH=/tmp/yolo-test-$$.log

# 1. happy path
AGY_BIN=/bin/echo AGY_YOLO_NO_DEFAULT_ARGS=1 node $WRAPPER hi
# expect: exit 0

# 2. singleton
AGY_BIN=/bin/sleep AGY_YOLO_NO_DEFAULT_ARGS=1 node $WRAPPER 3 &
sleep 0.3
AGY_BIN=/bin/sleep AGY_YOLO_NO_DEFAULT_ARGS=1 node $WRAPPER 3
# expect: exit 2

# 3. timeout
AGY_BIN=/bin/sleep AGY_YOLO_NO_DEFAULT_ARGS=1 AGY_YOLO_TIMEOUT_MS=1000 node $WRAPPER 30
# expect: exit 124

# 4. stuck-loop watchdog
AGY_BIN=/usr/bin/yes AGY_YOLO_NO_DEFAULT_ARGS=1 AGY_YOLO_TIMEOUT_MS=60000 \
  AGY_YOLO_CPU_SAMPLE_MS=500 AGY_YOLO_CPU_STUCK_SAMPLES=2 AGY_YOLO_CPU_THRESHOLD=50 \
  node $WRAPPER > /dev/null
# expect: exit 124

# 5. spawn error
AGY_BIN=/nonexistent AGY_YOLO_NO_DEFAULT_ARGS=1 node $WRAPPER
# expect: exit 127

rm -f /tmp/yolo-test-$$.lock /tmp/yolo-test-$$.log
```

## References

- Antigravity Lab: [practical fix guide for high CPU/memory usage](https://antigravitylab.net/en/articles/tips/antigravity-high-cpu-memory-usage-fix)
- AGY CLI docs: <https://antigravity.google/docs/cli-using>
- Known sandbox-bypass issue: <https://github.com/google-antigravity/antigravity-cli/issues/36>
