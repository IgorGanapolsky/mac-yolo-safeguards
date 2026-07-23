# ThumbGate Web reliability evidence — 2026-07-23

## Gate command

```bash
# Shell + control plane (CI-safe)
node tools/verify-thumbgate-web-reliability.js

# + remote D1 task/device census (needs wrangler + CF auth)
RELIABILITY_D1=1 node tools/verify-thumbgate-web-reliability.js

# + local Hermes gateway chat canary on this Mac
RELIABILITY_LOCAL_GATEWAY=1 RELIABILITY_D1=1 node tools/verify-thumbgate-web-reliability.js
```

## Scorecard (honest split)

| Layer | Result | Evidence |
|-------|--------|----------|
| Control plane health | **PASS** | `/api/health` → ok, D1 available, WorkOS/Stripe/cloudRunner configured |
| Public endpoints | **PASS** | `/`, `/dashboard`, brand assets 200 |
| Auth gates | **PASS** | devices/tasks/threads/lessons 401 without session |
| Store redirects | **PASS** | `/go/android`, `/go/ios` 302 |
| Mobile CSS app shell | **PASS** | live CSS: 100dvh, hermes-scroll-pane, composer relative, metrics hidden |
| Mobile JS contracts | **PASS** | data-mobile-tab, route explain, run error handling strings |
| Health stability | **PASS** | 5/5 consecutive `/api/health` |
| Fleet heartbeats | **PASS** | Pro + mini online within 2m; older Pro row may be stale |
| Local gateway chat | **PASS** (when canary on) | `RELIABILITY-OK` via session API in ~7s with `model=glm-coding` |
| Task outcomes (historical) | **MIXED** | 10 completed / 5 failed all-time — classes below |
| Task outcomes (24h) | **MOSTLY OK** | recent local + Continuity canaries completed; 1 timeout fail |

**Shell/layout reliability is verified.**  
**Task execution reliability is better today than historical debt, but not perfect.**

## Live fleet snapshot (D1 remote, re-verified)

- devices: 3 rows (2 heartbeating within ~2 minutes: MacBook Pro + Mac mini)
- tasks all-time: ~10 completed / 5 failed / 0 stuck non-terminal at census
- tasks 24h: ~5 total, 1 failed (timeout), rest completed including Continuity cloud canaries
- feedback_rows (Lessons): 0 — Lessons = 👍/👎 only, not chat count
- Continuity canaries 2026-07-23: `CONTINUITY-LIVE-OK` and `CONTINUITY-STALE-AUTO-OK` completed on cloud route

## Task failure classes (runtime debt)

| Class | Example | Status |
|-------|---------|--------|
| Local timeout | `The operation was aborted due to timeout` (150s connector `TASK_TIMEOUT_MS`) | **Open** — tool-heavy prompts can exceed 150s under load |
| Invalid model (historical) | `model=hermes` rejected by completions proxy | **Mostly mitigated** — gateway sessions default to platform label but chat remaps; pin `glm-coding` for canaries |
| Cloud model access (historical) | Together non-serverless `zai-org/GLM-5.1` | **Mostly mitigated** — 2026-07-23 Continuity canaries completed |

### Connector note (do not claim fixed without code + install)

- Installed LaunchAgent: `com.hermes.connector` → `~/.hermes/connector/hermes-cloud-connector.js`
- `TASK_TIMEOUT_MS = 150_000`; control-plane lease base `TASK_LEASE_MS = 90_000` with 30s renewals
- File `tools/hermes-cloud-connector.js` may be claimed by another agent (`T-THUMBGATE-POLL-BUDGET`) — timeout raise / model pin belongs there when free
- Connector log (`/tmp/hermes-connector.log`) can show intermittent `fetch failed` / session sync timeouts while heartbeats still succeed

## Local gateway canary (this Mac, 2026-07-23)

```text
POST /api/sessions  → model=glm-coding
POST .../chat "Reply with exactly RELIABILITY-OK"
→ RELIABILITY-OK in ~6.7s
```

Bare `model=hermes` / `hermes-agent` in chat body still completes on current gateway 0.19.0 (remaps). Historical LiteLLM rejection of bare `hermes` remains a class to watch if anything bypasses the session gateway.

## Deep research (PWA, Aug 2026)

- run_id: `trun_26f1bd2259b04955882c51cba558ce57`
- report: `parallel-research/pwa-mobile-web-august-2026.md`
- Applied: app shell, 100dvh, overflow lock, tab panes, relative composer
- Not yet: full installable PWA (manifest `id` + service worker), visualViewport keyboard lift

## How to re-verify

```bash
node tools/verify-thumbgate-web-reliability.js
RELIABILITY_D1=1 RELIABILITY_LOCAL_GATEWAY=1 node tools/verify-thumbgate-web-reliability.js
cd apps/hermes-control-plane && node --test tests/frictionless-onboarding.test.mjs
```
