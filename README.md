# mac-yolo-safeguards

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Platform: macOS](https://img.shields.io/badge/platform-macOS-blue.svg)](#)
[![Architecture: Apple Silicon + Intel](https://img.shields.io/badge/arch-Apple%20Silicon%20%2B%20Intel-lightgrey)](#)
[![Telemetry: none](https://img.shields.io/badge/telemetry-none-success)](#)

Safety net for running AI coding agents (Antigravity `agy`, Claude Code, Cursor, Codex) in YOLO mode on macOS without freezing the Mac.

> **TL;DR** — On 2026-05-26 my Mac hit load average **307** because an AI agent kept booting iOS Simulators in a loop. This repo is the four-piece kit that stopped it: a wrapper, a LaunchAgent, a plist, and a 12-point health check. MIT, no telemetry, symlinks-only install. Full incident write-up: [`CASE-STUDY.md`](./CASE-STUDY.md).

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

## The incident this came from

Load average **307**, 256+ `simruntime` processes, hard-reboot territory. Full timeline + 12/12 health-check output: [`CASE-STUDY.md`](./CASE-STUDY.md).

## Support & Paid Onboarding

This kit is fully open-source (MIT-licensed), free to use, and has **zero telemetry**.

If the safeguards saved your Mac from a freeze:
*   ⭐ **Star the repo** — it is the strongest signal that more system-level AI safety tooling should exist.
*   💬 **Open an issue** with your incident details — this directly helps us tune the next CPU and memory threshold defaults.

---

### 🛡️ Premium Service: "Hardened Mac AI Workstation"
If you are running autonomous AI coding agents (Claude Code, Cursor YOLO, Codex, etc.) and want a professionally secured workstation without tuning config files yourself, you can hire me to install and customize this safety net.

*   **What you get:**
    *   **30-minute Zoom onboarding:** White-glove installation of the wrappers and LaunchAgent.
    *   **Custom Tuning:** We baseline your specific macOS hardware, cores, and memory capacity to tailor the CPU limits, stuck-loop timeouts, and runaway threshold parameters.
    *   **Safety Drill:** We trigger a mocked process runaway on your machine to verify the safeguards fire and protect your system.
    *   **1-Week of Dedicated Tuning:** Ongoing post-install threshold adjustments via email/Slack.
*   **Price:** **$99 flat** (one-shot).
*   **100% Money-Back Guarantee:** If you are not satisfied or your Mac freezes within 30 days of setup, we refund the full amount instantly—no questions asked.

👉 **Book + pay in one click:** [**cal.com/igor-g-kvqxfo/30min**](https://cal.com/igor-g-kvqxfo/30min) — pick a time, Stripe collects $99, you get the calendar invite. Refunds always honored. Prefer email? [iganapolsky@gmail.com](mailto:iganapolsky@gmail.com) (subject: `Hardened Workstation Setup`) or [open a GitHub Issue tagged `help-wanted`](https://github.com/IgorGanapolsky/mac-yolo-safeguards/issues/new?title=%5BHelp+Wanted%5D+Hardened+Workstation+Setup).

## References

- Antigravity Lab: [practical fix guide for high CPU/memory usage](https://antigravitylab.net/en/articles/tips/antigravity-high-cpu-memory-usage-fix)
- AGY CLI docs: <https://antigravity.google/docs/cli-using>
- Known sandbox-bypass issue: <https://github.com/google-antigravity/antigravity-cli/issues/36>
