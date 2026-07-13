# Agent automations (mac-yolo-safeguards)

Recurring jobs and session hooks so Cursor / Claude agents operate on **telemetry + RAG**, not vibes.

## Session start (every chat)

```bash
node tools/agent-session-start.js          # human-readable
node tools/agent-session-start.js --full   # includes hermes-mobile Jest CI
node tools/agent-session-start.js --json   # machine-readable brief
```

Layers: LaunchAgent health → `ceo-operating-brief.js` → gateway/adb/revenue/newsletter ranked actions.

The CEO brief is also the Hermes Chief-of-Staff gate:

- agent execution and consequential human decisions are separate queues;
- the human decision queue is capped at three items;
- every action names its expected outcome and live signal;
- a lane that is waiting for an existing worker, external reply, or approval is reported as value-exhausted instead of generating more activity;
- an active phone pipeline suppresses new pair/install/E2E recommendations, preventing two agents from driving the same device.

This adapts the useful operating controls from Lee Harrington's [AI Chief of Staff](https://nginx.leebasehome.com/writing/tech/setting-up-an-ai-chief-of-staff/) pattern. It deliberately reuses `plan.md`, ThumbGate lessons, and existing receipts instead of adding parallel `status.md` / `today.md` / `log.md` state.

## Install all agent LaunchAgents

```bash
bash scripts/install-agent-automations.sh
./install.sh   # also installs com.igor.shutdown-simulators (60s sim guard)
bash scripts/verify-agent-automations.sh
```

## Scheduled jobs

| Label | Interval | Tool | Purpose |
|-------|----------|------|---------|
| `com.igor.ceo-operating-brief` | 24h | `tools/ceo-operating-brief.js --json` | Daily CEO pick + telemetry log |
| `com.igor.react-native-newsletter-ingest` | 7d | `tools/react-native-newsletter-ingest.js --decision-stack` | RN newsletter ROI scoring |
| `com.igor.hermes-contribution-opportunities` | 30m | `tools/hermes-contribution-opportunities.js` | Hermes-agent contribution radar |
| `com.igor.hermes-mobile-continuous-e2e` | 15m | `hermes-mobile/scripts/run-continuous-e2e.sh --once` | Unit tests + Maestro E2E (Android USB → iOS sim) |
| `com.igor.shutdown-simulators` | 60s | `sim-runaway-guard.sh` | Mac freeze guard (protected) |

Logs: `~/Library/Logs/<label>.log` (CEO brief uses `ceo-operating-brief.log`).

## Manual one-shots (same tools)

| Task | Command |
|------|---------|
| Decision stack | `node tools/agent-decision-stack.js --task "..." --json` |
| Hermes operator ML | `node tools/hermes-decision-loop.js --json` |
| Revenue DS | `node tools/pipeline-data-science.js` |
| Ship preflight | `cd hermes-mobile && npm run launch:preflight:android` |

## Cursor rule

`.cursor/rules/agent-automations.mdc` — always run session start before non-trivial work.

## Hermes Mobile continuous E2E

```bash
cd hermes-mobile
npm run e2e:continuous:status    # LaunchAgent + latest.json
npm run e2e:continuous:once      # manual cycle
npm run e2e:continuous:watch     # on src/ changes (dev)
```

Install is included in `bash scripts/install-agent-launchagents.sh`. Logs: `~/Library/Logs/hermes-mobile-continuous-e2e.log`.

## Uninstall agent LaunchAgents

```bash
UID=$(id -u)
for label in com.igor.ceo-operating-brief com.igor.react-native-newsletter-ingest com.igor.hermes-contribution-opportunities; do
  launchctl bootout "gui/$UID/$label" 2>/dev/null || true
  rm -f "$HOME/Library/LaunchAgents/$label.plist"
done
```
