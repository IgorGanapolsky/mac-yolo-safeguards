# Cursor Automations — agent operating loop

Committed workflow drafts for **Cursor Cloud Automations** plus **local LaunchAgents** that run without the IDE open.

## Zero-friction onboarding (June 2026 pattern)

Research-backed flow: **one Mac command**, **no typing on phone** (QR + adb deep link + auto LAN discovery).

| Step | Agent runs (not user) |
|------|------------------------|
| **Full bootstrap** | `bash scripts/bootstrap-zero-friction.sh` |
| **Phone pairing** | `node tools/agent-session-start.js` or `node tools/hermes-mobile-pair.js` |
| **Session probe** | `node tools/agent-session-start.js --full` |

Deep link `hermes://setup` is pushed via adb when a device is connected — no Settings typing.

## Cursor Automations (cloud agent)

Draft YAML lives in `.cursor/automations/`. Import via **Cursor → Automations → Create → paste or import** (Agents Window supports `open_automation` prefill).

| File | Trigger | Purpose |
|------|---------|---------|
| `daily-ceo-operating-brief.yaml` | Weekdays 08:00 | `ceo-operating-brief.js --full` + executive summary |
| `pr-decision-stack-review.yaml` | PR opened | RAG review + `ci-verify` + Hermes `test:ci` when touched |
| `weekly-newsletter-roi.yaml` | Monday 09:00 | Newsletter ingest + decision-stack + one ROI action |
| `hermes-mobile-ship-preflight.yaml` | Weekdays 14:00 | Jest CI, preflight grep, optional device E2E |

All prompts reference **AGENTS.md** Decision stack (DS / ML / RAG). Schedules use cron in the workflow file; adjust timezone in the Automations editor if needed.

### Enable in Cursor

1. Open **Agents** window (Automations editor handoff requires it).
2. Create automation → import each YAML from `.cursor/automations/`.
3. Confirm repo `IgorGanapolsky/mac-yolo-safeguards`, branch `main`.
4. For `pr-decision-stack-review.yaml`, enable **Comment on PRs**.
5. Save and enable each automation.

## Local LaunchAgents (Mac, no cloud)

Templates at repo root (`com.igor.*.plist`). Install all:

```bash
bash scripts/install-agent-launchagents.sh
```

| Label | Interval | Tool |
|-------|----------|------|
| `com.igor.ceo-operating-brief` | 24h | `tools/ceo-operating-brief.js --json` |
| `com.igor.react-native-newsletter-ingest` | 7d | `tools/react-native-newsletter-ingest.js --decision-stack` |
| `com.igor.hermes-contribution-opportunities` | (see plist) | Hermes upstream opportunities |
| `com.igor.shutdown-simulators` | 60s | sim runaway guard (protected) |

Logs: `~/Library/Logs/<label>.log` (ceo + newsletter use unified log paths in plists).

### Status probe (session start)

```bash
node tools/agent-session-start.js       # LaunchAgent check + CEO brief
node tools/agent-session-start.js --full   # includes hermes-mobile Jest CI
bash scripts/verify-agent-automations.sh   # LaunchAgents only (exit 1 if missing)
node tools/agent-automation-status.js    # status + lists .cursor/automations drafts
```

## Agent protocol

Per AGENTS.md:

1. Session start → `node tools/agent-session-start.js` (or `node tools/agent-automation-status.js` for status only)
2. Before ship claims → `--full` brief + scoped tests
3. After incidents → ThumbGate capture with artifacts

## Related

- [REACT-NATIVE-NEWSLETTER-INGEST.md](./REACT-NATIVE-NEWSLETTER-INGEST.md)
- [HERMES-CONTRIBUTION-AUTOMATION.md](./HERMES-CONTRIBUTION-AUTOMATION.md)
- `.cursor/rules/decision-stack.mdc` (always-applied Cursor rule)
