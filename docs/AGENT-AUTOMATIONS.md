# Agent automations (mac-yolo-safeguards)

Recurring jobs and session hooks so Cursor / Claude agents operate on **telemetry + RAG**, not vibes.

## Session start (every chat)

```bash
node tools/agent-session-start.js          # human-readable
node tools/agent-session-start.js --full   # includes hermes-mobile Jest CI
node tools/agent-session-start.js --json   # machine-readable brief
```

Layers: LaunchAgent health → `ceo-operating-brief.js` → gateway/adb/revenue/newsletter ranked actions.

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
| `com.igor.revenue-autonomous-loop` | 4h | `tools/revenue-autonomous-loop.js --auto-send --json` | Funnel diagnose, Stripe link health, due follow-ups, Gmail auto-send (cap 5), ntfy |
| `com.igor.smart-ops` | 1h | `tools/smart-ops-controller.js --json` | Efficient brain: heal agents, revenue `--fast`, GH reply monitor, **market signals** (`hermes-hosted` + `enterprise-sdlc`, pipeline apply once/day) |

Logs: `~/Library/Logs/<label>.log` (CEO brief uses `ceo-operating-brief.log`; revenue loop: `~/Library/Logs/mac-yolo/revenue-autonomous-loop.*.log`).

### Revenue autonomous loop (cash path)

Runs unattended every 4h and on agent session start:

1. Read private `business_os/revenue/pipeline-status-*.tsv` + stripe offer map
2. curl-verify every `buy.stripe.com` link (never send 403s)
3. Queue follow-ups when `stage=sent|proposed` and `last_touch` ≥ 48h
4. Auto-send via `google_api.py` when token healthy (`REVENUE_AUTO_SEND=1`); else write `pending-sends.json` for Gmail MCP
5. Private board + JSONL receipts under `business_os/revenue/`
6. ntfy push summary

Manual:

```bash
node tools/revenue-autonomous-loop.js --json
node tools/revenue-autonomous-loop.js --auto-send --json
REVENUE_AUTO_SEND=0 node tools/revenue-autonomous-loop.js --json   # diagnose only
```

**Honesty:** this loop never marks `paid` without Stripe charge proof (`record-cleared-payment.js`).

### Zero-manual policy (2026-07-14)

- **No human homework** in LaunchAgents (no ntfy that says “open Gmail and send”).
- Gmail path: live API probe → if token dead, **Chrome Gmail compose** using logged-in session.
- Partner Pilot follow-up agent calls `scripts/partner-pilot-followup-auto.sh` → same loop.
- Reddit-only / no-email prospects are auto-closed as `lost` (channel exhausted), not left as agent homework.

### Smart + efficient (2026-07-14)

```bash
node tools/smart-ops-controller.js --json          # hourly brain
node tools/revenue-autonomous-loop.js --fast --json  # cache Stripe, skip Apollo/Chrome, quiet noop ntfy
```

| Efficiency | Behavior |
|------------|----------|
| Stripe HTTP | Cached 60m (`stripe-health-cache.json`) in `--fast` |
| Revenue skip | Smart-ops skips if last receipt &lt; 25m |
| Reply monitor | Skip if state mtime &lt; 90m |
| ntfy | Quiet when noop in fast mode (`REVENUE_NTFY_QUIET_NOOP=1`) |
| Session start | Runs smart-ops (not full heavy revenue path) |
| Market signals | `SMART_OPS_MARKET_SIGNAL=1` (default on smart-ops LaunchAgent); presets `hermes-hosted,enterprise-sdlc`; pipeline apply **once/day** |

### Install / reinstall revenue automations

```bash
bash scripts/setup-revenue-automations.sh
```

Idempotent: refreshes `main-runtime` to `origin/main`, installs `com.igor.smart-ops` + `com.igor.revenue-autonomous-loop`, rewrites partner/outreach nudge scripts to call smart-ops (no human homework), runs one proof cycle.

### `ibm-yolo` (Mac Pro + Mac mini)

Enterprise multi-agent SDLC reliability CLI (IBM Bob-class market signal — not an IBM product):

```bash
bash scripts/install-ibm-yolo.sh              # this Mac + hermes-mini
bash scripts/install-ibm-yolo.sh --no-remote  # local only
ibm-yolo --doctor
ibm-yolo                  # enterprise-sdlc signal + pipeline apply
ibm-yolo --both --json    # hermes-hosted + enterprise-sdlc
ibm-yolo --smart-ops      # chain smart-ops after signal
```


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
