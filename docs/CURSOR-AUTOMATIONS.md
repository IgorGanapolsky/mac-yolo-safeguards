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

Also installs `com.igor.repo-root-hygiene` via `scripts/install-repo-root-hygiene-agent.sh`.

| Label | Interval | Tool / purpose |
|-------|----------|----------------|
| `com.igor.agent-vault-sync` | 30m | `scripts/agent-vault-sync.sh` — vault ff-only pull + `agent-sync-brief.js --vault` |
| `com.igor.repo-root-hygiene` | 5m | `tools/repo-root-hygiene.js --repair` — allowlisted root drift repair |
| `com.igor.smart-ops` | 1h | `tools/smart-ops-controller.js` — heal missing agents, revenue fast path |
| `com.igor.hermes-mobile-continuous-e2e` | 15m | `hermes-mobile/scripts/run-continuous-e2e.sh --once` |
| `com.igor.hermes-usb-reverse-watchdog` | 15s | `tools/hermes-usb-reverse-watchdog.js` — adb reverse self-heal |
| `com.igor.shutdown-simulators` | 60s | sim runaway guard (protected) |
| `com.igor.ceo-operating-brief` | 24h | `tools/ceo-operating-brief.js --json` |
| `com.igor.revenue-autonomous-loop` | 4h | revenue pipeline |
| `com.igor.react-native-newsletter-ingest` | 7d | `tools/react-native-newsletter-ingest.js --decision-stack` |
| `com.igor.hermes-contribution-opportunities` | (see plist) | Hermes upstream opportunities |
| `com.igor.github-reply-monitor` | 2h | PR/issue reply scan (when installed) |

**Vault-only (outside repo installer):** `com.igor.vault-selfheal` (1h) lives in
`~/Library/LaunchAgents/` and runs `~/.local/bin/vault-selfheal.sh` — drift
detect + ntfy alert; uses mirror when TCC blocks `~/Documents`.

**GitHub scheduled hygiene (no Mac required):**

| Workflow | Schedule | Purpose |
|----------|----------|---------|
| `.github/workflows/pr-hygiene.yml` | every 6h | auto-merge green PRs; stale PR close |
| `.github/workflows/mobile-continuous.yml` | every 6h | Hermes Mobile unit + contract in cloud |

### GitHub Code Quality (Hermes Mobile, evaluate-first)

Paid product (~$10/active committer/month + metered AI credits; bots are not committers). **Do not enable org-wide blindly.** Prefer **evaluate** rulesets before **active** enforcement.

| Step | Agent runs |
|------|------------|
| Status probe | `node tools/github-code-quality-status.js` (`--json` for automation) |
| Enable product (repo owner, Team/Enterprise plan) | `gh api --method PATCH repos/IgorGanapolsky/mac-yolo-safeguards/code-quality/setup -f state=configured` |
| Disable product (stop billing) | `gh api --method PATCH repos/IgorGanapolsky/mac-yolo-safeguards/code-quality/setup -f state=not-configured` |
| Import evaluate coverage gate | Settings → Rules → Rulesets → Import `.github/code-quality-coverage-ruleset.evaluate.json` (64% min / 2pt max drop — matches Jest global lines threshold) |
| Apply evaluate ruleset via API | `gh api --method POST repos/IgorGanapolsky/mac-yolo-safeguards/rulesets --input .github/code-quality-coverage-ruleset.evaluate.json` |

CI already uploads `hermes-mobile/coverage/cobertura-coverage.xml` via `actions/upload-code-coverage` on `mobile-checks` (`fail-on-error: false` until Code Quality is enabled on the repo). After enablement, flip that flag to `true` and promote the ruleset from **evaluate** → **active** only when coverage is stable.

Logs: `~/Library/Logs/mac-yolo/` (most agents) or `~/Library/Logs/<label>.log`.

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
