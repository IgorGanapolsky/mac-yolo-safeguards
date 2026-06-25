# mac-yolo-safeguards

[![Latest release](https://img.shields.io/github/v/release/IgorGanapolsky/mac-yolo-safeguards?display_name=tag&color=brightgreen)](https://github.com/IgorGanapolsky/mac-yolo-safeguards/releases/latest)
[![GitHub stars](https://img.shields.io/github/stars/IgorGanapolsky/mac-yolo-safeguards?style=flat&color=yellow)](https://github.com/IgorGanapolsky/mac-yolo-safeguards/stargazers)
[![Open issues](https://img.shields.io/github/issues/IgorGanapolsky/mac-yolo-safeguards)](https://github.com/IgorGanapolsky/mac-yolo-safeguards/issues)
[![Last commit](https://img.shields.io/github/last-commit/IgorGanapolsky/mac-yolo-safeguards)](https://github.com/IgorGanapolsky/mac-yolo-safeguards/commits/main)
[![License: MIT](https://img.shields.io/github/license/IgorGanapolsky/mac-yolo-safeguards?color=yellow)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-macOS-blue)](#)
[![Arch](https://img.shields.io/badge/arch-Apple%20Silicon%20%2B%20Intel-lightgrey)](#)
[![Telemetry](https://img.shields.io/badge/telemetry-none-success)](#telemetry-and-privacy)

**The OS-level safeguards layer for AI agent loops.** Runaway-kill, hard timeouts, and resource limits — the enforcement your agent harness is missing — so coding agents (Antigravity `agy`, Claude Code, Cursor, Codex) running in YOLO mode can't burn your tokens or freeze your Mac.

> **TL;DR** — On 2026-05-26 my Mac hit load average **307** because an AI agent kept booting iOS Simulators in a loop. This repo is the four-piece kit that stopped it: a wrapper, a LaunchAgent, a plist, and a 12-point health check. MIT, no telemetry, symlinks-only install. Full incident write-up: [`CASE-STUDY.md`](./docs/CASE-STUDY.md).

**Paid reliability help:** [Book 20-min triage](https://cal.com/igor-g-kvqxfo/30min) | [Partner Pilot](./docs/PARTNER-PILOT.md) | [Public-safe paid inquiry](https://github.com/IgorGanapolsky/mac-yolo-safeguards/issues/new?template=paid-hardening-inquiry.yml)

## For Teams And Partners

If you only need the free Mac guard, install it below.

**Built your app with AI (Cursor, Claude Code, Lovable, Bolt) and not sure it's safe to launch?** Get it audited for leaked secrets, runaway cloud bills, and crash-under-load bugs → **[AI App Safety Audit](./docs/AI-APP-SAFETY-AUDIT.md)** (5-day fixed-fee, plain-English report).

If you run agents for a team or clients and have a repeated failure that costs hours, tokens, delivery risk, or client trust, start with [AI Agent Reliability Hardening](./docs/AI-AGENT-HARDENING.md):

| Path | Deliverables | Pricing |
|---|---|---|
| **Diagnostic Call** | 20-min live review, root-cause triage readout, recommended prevention rules, no installation. | `$499` |
| [Partner Pilot](./docs/PARTNER-PILOT.md) | Agencies or consultants need a reusable client-facing reliability package. | `$3,000` |

Private workflow details: [book a 20-minute triage](https://cal.com/igor-g-kvqxfo/30min) or email [iganapolsky@gmail.com](mailto:iganapolsky@gmail.com). Public-safe intake: [open a paid hardening inquiry](https://github.com/IgorGanapolsky/mac-yolo-safeguards/issues/new?template=paid-hardening-inquiry.yml).

## Background

On 2026-05-26 an iPhone 17 simulator was auto-booted (first by macOS window restoration, later by Antigravity's `agy` agent running with `--dangerously-skip-permissions`) and slammed the Mac to load average **307** with 256+ simulator runtime processes. This repo holds the safeguards that prevent recurrence.

## Contents

| File | Installs to | Purpose |
|---|---|---|
| `agy-yolo-wrapper.js` | `~/workspace/git/igor/antigravity-hub/antigravity-cli/bin/` | Hardened wrapper around `agy --dangerously-skip-permissions`. Adds singleton lock, hard timeout, stuck-loop watchdog, spawn-error handling, and `--sandbox`. |
| `hermes-yolo-wrapper.js` | `~/.local/bin/hermes-yolo` | Same safeguards for `hermes --yolo` (singleton lock, timeout, CPU watchdog). |
| `sim-runaway-guard.sh` | `~/.local/bin/` | Threshold-checking script. Shuts down booted simulators when simruntime processes exceed the hard ceiling, or when lower-count simulator pressure crosses load/memory thresholds. |
| `com.igor.shutdown-simulators.plist` | `~/Library/LaunchAgents/` | LaunchAgent that runs the guard script every 60 seconds. |
| `yolo-health` | `~/.local/bin/` | Health-check that verifies all safeguards are installed and active. Run anytime: `yolo-health` |
| `tools/local-inference-readiness.js` | repo-local | Verifies Hermes' configured local model fallback and checks for a serious OpenAI-compatible serving endpoint such as vLLM/LocalAI. |
| `hermes-mobile/` | (companion app) | Expo mobile client for ThumbGate approvals and gateway health — see [`hermes-mobile/README.md`](./hermes-mobile/README.md). |

All install targets above (except `hermes-mobile/`) are **symlinks** pointing back to this repo so edits land in one canonical place.

Revenue tools write private `*.md` / `*.tsv` artifacts to `business_os/revenue/` (not the repo root). After a local ops session:

```sh
./scripts/migrate-root-ops-to-business-os.sh   # move any legacy root clutter
./scripts/clean-private-root-artifacts.sh      # delete strays still in root
```

## What this does NOT do

Scope is deliberately narrow. The kit does **not**:

- **Manage arbitrary Mac memory pressure.** If you have many editors + AI tools open and CleanMyMac yells about RAM, that's expected behavior — not a runaway. The kit detects runaway *iOS Simulator spawning* and only auto-reclaims known-safe memory hogs such as orphaned automation Chrome, redundant secondary browsers, and oversized Ollama `llama-server` workers under real pressure.
- **Kill, quit, or otherwise touch GUI apps** (Antigravity, Cursor, Xcode, Ghostty, Android Studio, browsers, IDEs). Ever. Hard rule. Foreground apps have unsaved work the user cares about more than they care about the freeze. The escalation path is a critical macOS alert, not a kill signal.
- **Stop the agent itself from being memory-hungry.** A running `agy` / `claude` / `cursor-agent` process consuming 1–2 GB is normal AI-agent behavior. The guard *notifies* (once per 30 min, debounced) when free memory drops below 15% and an AI process exceeds 1.5 GB RSS, but it only auto-kills known-safe worker/cache processes.
- **Phone home.** No telemetry. See [`§ Telemetry and privacy`](#telemetry-and-privacy).
- **Work on Linux or Windows.** macOS-only. The LaunchAgent, `xcrun simctl`, and `simruntime` process names are all Apple-specific.

If your symptom is "Mac is slow because I have 200 Chrome tabs and 6 IDEs open" — close some. That's not what this kit is for.

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

## Hermes Runtime Readiness

Hermes can look healthy while its local fallback is only configured on paper. The high-signal checks are:

```sh
yolo-health
node tools/hermes-productivity-audit.js --json
node tools/local-inference-readiness.js
```

The runtime model is deliberately tiered:

- Ollama is acceptable for quick local fallback and smoke tests.
- A serious local inference path should expose an OpenAI-compatible `/v1` API with predictable model loading, context length, logs, and concurrency behavior. vLLM or a LocalAI-style gateway is the evaluation target for that tier.
- `terminal.cwd` must point at an existing active repo. A stale cwd is treated as a reliability failure because Telegram/Hermes tools will run in the wrong project or return `exit 130` interruptions.

## Guard configuration (env vars)

The LaunchAgent reads these from the environment when `sim-runaway-guard.sh` runs. Override by editing the plist or wrapping the script.

| Var | Default | Effect |
|---|---|---|
| `YOLO_ESCALATE_AFTER_FIRES` | `3` | Sim runaways within the window before showing a critical alert. |
| `YOLO_ESCALATE_WINDOW_SEC` | `600` (10 min) | Window for counting recent fires. |
| `YOLO_SUSPECT_APPS` | empty | Opt-in only. If set to a pipe-separated app list, escalation will quit those apps. **Default empty** — no GUI app gets auto-killed. |
| `YOLO_SIM_PROC_HARD_LIMIT` | `50` | Shut down all simulators whenever simruntime process count exceeds this ceiling, independent of load average. |
| `YOLO_MEM_FREE_PCT_THRESHOLD` | `15` | Free-memory % below which the memory-pressure check is armed. |
| `YOLO_MEM_PROC_RSS_MB_THRESHOLD` | `1500` | Single-process RSS (MB) that counts as "memory hog" for notify. |
| `YOLO_MEM_NOTIFY_DEBOUNCE_SEC` | `1800` (30 min) | How long to wait between memory-pressure notifications. |
| `YOLO_RECLAIM_OLLAMA` | `1` | Under real memory pressure, kill oversized Ollama `llama-server` workers while leaving `ollama serve` running. |
| `YOLO_OLLAMA_RSS_MB_THRESHOLD` | `12000` | Ollama worker RSS (MB) required before auto-reclaim can fire. |

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

Guard E2E (browser reclaim + CPU autokill):

```sh
tests/test-secondary-browser-reclaim.sh
```

## CI/CD

**CI** ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)) runs on every push/PR to `main`:

| Job | Runner | What it verifies |
|---|---|---|
| `macos-guard` | `macos-latest` | JS/shell syntax, `./install.sh`, `yolo-health`, guard E2E, secret scan |
| `revenue-public-checks` | `ubuntu-latest` | Public funnel docs, issue templates, publication readiness |
| `mobile-checks` | `ubuntu-latest` | `hermes-mobile` release readiness, Expo Doctor, typecheck, unit tests |

Local mirror before pushing:

```sh
./scripts/ci-verify.sh
```

**CD** — Hermes Mobile (`com.iganapolsky.hermesmobile`):

| Workflow | Trigger | Purpose |
|---|---|---|
| [`.github/workflows/internal-distribution.yml`](.github/workflows/internal-distribution.yml) | Manual `workflow_dispatch` | Quality gate → EAS internal APK/IPA → Firebase Android distro |
| [`.github/workflows/store-release.yml`](.github/workflows/store-release.yml) | Manual `workflow_dispatch` | Requires internal signoff on exact SHA → production EAS build → **Play Production** track |

Firebase: [hermes-mobile/docs/FIREBASE_CI.md](./hermes-mobile/docs/FIREBASE_CI.md) (internal QA)

Google Play: [hermes-mobile/docs/PLAY_RELEASE.md](./hermes-mobile/docs/PLAY_RELEASE.md) (LLC org, production track)

```sh
./scripts/sync-firebase-secrets.sh          # Firebase App Distribution
./scripts/sync-hermes-secrets.sh            # EAS / Apple (hermes-mobile/.env)
```

EAS: [@igorganapolsky/hermes-mobile](https://expo.dev/accounts/igorganapolsky/projects/hermes-mobile) (`4ed13e30-9b97-4ddd-8a12-59106cae90d6`).

## The incident this came from

Load average **307**, 256+ `simruntime` processes, hard-reboot territory. Full timeline + 12/12 health-check output: [`CASE-STUDY.md`](./docs/CASE-STUDY.md).

## Support & Paid Hardening

This kit is fully open-source (MIT-licensed), free to use, and has **zero telemetry**.

If the safeguards saved your Mac from a freeze:
*   ⭐ **Star the repo** — it is the strongest signal that more system-level AI safety tooling should exist.
*   💬 **Open a public incident issue** with non-sensitive details — this directly helps us tune the next CPU and memory threshold defaults.

---

### For teams running AI agents in production workflows

One Mac freeze is annoying. The expensive problem is **repeated** agent behavior — runaway loops, retry storms, and forgotten autonomous sessions that quietly burn real money. 

> [!WARNING]
> **API Billing Change (June 15, 2026):** Anthropic is moving headless Agent SDK and CLI (`claude -p`) usage out of fixed-subscription pools and charging raw API rates. A runaway loop or recursive script will now directly drain your API credits in minutes. Safe execution boundaries are now financial protection.

Even with official updates (like v2.1.166 addressing the macOS `bg-pty-host` 100% CPU lockup), terminal agents still enter stuck loops, crash workflows, and burn thousands of tokens. The model isn't the issue; nothing caps the loop at the process layer before the bill lands.

**AI Agent Hardening Sprint — $1,500.** I take *one* recurring failure pattern in your agent workflow, root-cause it, and install the guardrails that block or escalate it — the Mac runaway guard plus [ThumbGate](https://thumbgate.ai/?utm_source=mac-yolo-safeguards&utm_medium=readme&utm_campaign=cross_promo) memory gates — then leave you with a smoke test, before/after evidence, and handoff notes. Fixed scope, one workflow, proof at the end. If the failure costs you less than $1,500, use the free kit above instead and keep your money.

Best fit: founders and teams running Claude Code, Cursor, Codex, or Antigravity daily who can point to one failure that has cost real hours or dollars more than once.

**Start here:** email **[iganapolsky@gmail.com](mailto:iganapolsky@gmail.com)** or book a 20-min triage via **[Cal.com](https://cal.com/igor-g-kvqxfo/30min)** with: the agent stack, the repeated failure, and what one incident cost you. Full scope: [AI Agent Reliability Hardening](./docs/AI-AGENT-HARDENING.md).

*Also available:* a $499 diagnostic (root-cause readout only, no install) for smaller pain, and a $3,000 [Partner Pilot](./docs/PARTNER-PILOT.md) (sprint + reusable client package) for agencies reselling reliability. Operator playbook: [Sales Close Kit](./docs/SALES-CLOSE-KIT.md).

Public GitHub issues must stay public-safe. Do not post secrets, customer names, private repository details, payment data, or proprietary logs. Use the paid triage links above for private workflow details.

## Telemetry and privacy

This kit ships **zero telemetry**. Specifically:

- No network calls of any kind — the wrapper, guard, and health check only read local process state (`ps`, `uptime`, `xcrun simctl`) and shell out to local binaries. There is no `fetch`, `curl`, `http.request`, or equivalent anywhere in the codebase.
- All logs are written to `/tmp/` (gitignored). Nothing leaves your Mac.
- No analytics, no error reporting, no usage pings.

Verify it yourself:

```sh
grep -rE 'fetch|http\.|https\.|XMLHttpRequest|curl |wget |require\(.https.|require\(.http.' \
    agy-yolo-wrapper.js sim-runaway-guard.sh yolo-health install.sh
# expect: no matches
```

The maintainer's own launch-traffic analytics live in **GitHub Insights → Traffic** (free, GitHub-native, only the maintainer sees them), **Cal.com bookings dashboard**, and **Stripe Dashboard** — none of which involve any code shipped to your machine.

## Related: the *upstream* version of this problem

This kit handles the **blast radius** when an AI agent goes off the rails — your Mac doesn't freeze, your simulators don't multiply, your IDEs keep their unsaved work.

It does **not** handle the *bill* for that misbehavior. Every retry loop, every "let me try a different approach", every hallucinated import that costs you tokens — those add up to $400–$1,500/mo of repeated-mistake spend on Claude / Cursor / Codex / Gemini bills.

If that's also your pain, the same author built [**ThumbGate**](https://thumbgate.ai/?utm_source=mac-yolo-safeguards&utm_medium=readme&utm_campaign=cross_promo) — open-source, MCP-compatible, thumbs-down once → that mistake is permanently blocked on every future agent call. The paid hardening offers combine this Mac guard with ThumbGate's token-layer memory gates.

## References

- Antigravity Lab: [practical fix guide for high CPU/memory usage](https://antigravitylab.net/en/articles/tips/antigravity-high-cpu-memory-usage-fix)
- AGY CLI docs: <https://antigravity.google/docs/cli-using>
- Known sandbox-bypass issue: <https://github.com/google-antigravity/antigravity-cli/issues/36>
