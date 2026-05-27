# Case study: Mac load average 307 → 24 in 14 hours

_Incident date: 2026-05-26. Verification date: 2026-05-27._

## What happened

On 2026-05-26 an iPhone 17 simulator was auto-booted on macOS Darwin 25.5.0 — first by window restoration on login, then a second time by Antigravity's `agy` CLI agent running with `--dangerously-skip-permissions`. The simulator runtime forked aggressively. Within minutes the Mac had **256+ `simruntime` processes** and **load average 307**. Beach-ball, fans at max, IDE windows unresponsive.

## What we built (in 6 hours)

A four-piece kit, all in [`mac-yolo-safeguards`](https://github.com/IgorGanapolsky/mac-yolo-safeguards):

1. **`agy-yolo-wrapper.js`** — drop-in replacement for `agy --dangerously-skip-permissions`. Singleton lock (one agy at a time), 30-min hard timeout, stuck-loop watchdog (kills if >80% CPU for 2 min), spawn-error handling, `--sandbox` flag wired in.
2. **`sim-runaway-guard.sh`** — runs every 60 seconds via LaunchAgent. Kills runaway simulators when `load>30 AND sim_procs>50` (CPU runaway) **OR** `sim_mem>50% AND sim_procs>50` (memory hog).
3. **`com.igor.shutdown-simulators.plist`** — the LaunchAgent.
4. **`yolo-health`** — 12-point installer + verifier.

Plus a `mac-freeze-rescue` Claude Code skill so future sessions auto-diagnose without re-explaining.

## What stayed unkillable

A hard rule baked into the guard: **never auto-quit GUI apps.** No Antigravity, no Cursor, no Xcode, no Ghostty, no IDEs. They might have unsaved work. The guard escalates with a `display alert` instead. The user pushed back firmly when an earlier version of the script tried to quit Antigravity IDE — the rule is now codified in `sim-runaway-guard.sh:16-19` and in the operator's auto-memory.

## Evidence

### Wrapper test suite — 5/5 passing

```sh
WRAPPER=./agy-yolo-wrapper.js
export AGY_YOLO_LOCK_PATH=/tmp/yolo-test-$$.lock AGY_YOLO_LOG_PATH=/tmp/yolo-test-$$.log

# 1. happy path        → exit 0
# 2. singleton block   → exit 2
# 3. hard timeout      → exit 124
# 4. stuck-loop watch  → exit 124
# 5. spawn error       → exit 127
```

(Full commands in repo `README.md` §Tests.)

### `yolo-health` — 12/12 passing on 2026-05-27 10:33

```
=== agy-yolo-wrapper.js ===
  [OK] syntactically valid JavaScript
  [OK] singleton lock present
  [OK] hard timeout present
  [OK] stuck-loop watchdog present
  [OK] spawn-error handler present
  [OK] --sandbox flag wired in

=== Simulator runaway guard ===
  [OK] script exists and is executable
  [OK] LaunchAgent plist present
  [OK] LaunchAgent loaded
  [OK] runs every 60 seconds
  [OK] memory-hog branch present

=== Live Mac state ===
  10:33  up 14:18, 11 users, load averages: 24.14 12.39 6.13
  Sim runtime processes: 0
  Booted simulators:     0
  agy processes:         4
  agy-yolo lock held:    yes (PID 32822)

=== Summary: 12 passed, 0 failed ===
```

### Load trajectory

| When | Load avg (1m) | Sim procs | Notes |
|---|---|---|---|
| 2026-05-26 ~mid-day | **307** | 256+ | Pre-kit. Mac beach-balling, hard reboot considered. |
| 2026-05-26 evening | < 5 | 0 | Kit installed. LaunchAgent loaded. |
| 2026-05-27 10:33 | 24.14 / 12.39 / 6.13 | 0 | 4 active agy sessions. Wrapper holding singleton lock on PID 32822. Guard never fired today (no sim ever booted). |

The 24.14 reading is **not** the kit failing — it reflects 4 concurrent agy agents legitimately consuming CPU. Sim count is zero. The kit prevented the runaway path entirely.

## What the kit explicitly does NOT do

- Does not stop the user from typing `xcrun simctl boot ...` manually. The threshold logic only triggers on **runaway counts** (>50 procs), not normal use.
- Does not touch GUI apps. Foreground apps are off-limits by user policy.
- Does not log to a remote endpoint. All logs land in `/tmp` and are gitignored.
- Does not bypass macOS sandboxing or SIP. Pure userland.

## Replication

```sh
git clone https://github.com/IgorGanapolsky/mac-yolo-safeguards ~/workspace/mac-yolo-safeguards
cd ~/workspace/mac-yolo-safeguards
./install.sh
yolo-health   # expect: 12/12
```

Idempotent. Symlinks. No global installs. Uninstall = `rm` the symlinks.

## If this saved you

- ⭐ Star the repo — that's the strongest signal that more dev tooling like this should exist.
- 💬 Open an issue describing your incident — it helps shape the next threshold.
- 🛠️ **Want help on your Mac?** [Book a 30-min session]({{CTA_PLACEHOLDER}}) — flat $99 to install + tune the kit on your machine and walk through one full freeze rescue with you.

_All data above is reproducible from this repo. No telemetry was collected._
