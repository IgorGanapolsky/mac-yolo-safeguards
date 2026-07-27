# ThumbGate observability map — 2026-07-24

How we know about bugs/crashes, and what shipped today.

## Surfaces

| Surface | Crash / error signal | Alert path |
|---------|----------------------|------------|
| Hermes Mobile (prod store/OTA) | Sentry + PostHog `$exception` | Sentry issues / PostHog Error Tracking |
| Hermes Mobile dogfood/dev | Intentionally silent (PostHog fail-closed) | Local logs only |
| ThumbGate web UI | `ClientErrorBeacon` → funnel `client_error` counter | `/api/health` → `telemetry.clientErrorsToday` |
| ThumbGate APIs / routing | `saas-watchdog` every 5m | ntfy on **transition** to degraded |
| Task runtime failures | D1 `tasks.error` | Reliability gate / manual query |
| Continuous mobile E2E | `latest.json` e2e pass/fail/skip | Observability ship gate |
| Cloudflare Worker | Workers observability enabled | CF dashboard |

## 2026-07-24 fixes

1. **Watchdog false degrade fixed** — `/api/me` is public `200 + authenticated:false` by design; watchdog no longer treats that as failure. Private gate is now **`/api/tasks` → 401**.
2. **Web client error counter** — `ClientErrorBeacon` on landing (`FunnelSignals`) + dashboard layout posts content-free `client_error` events (no stack/PII). Exposed on health as `clientErrorsToday`.
3. **Continuous E2E** — LaunchAgent kicked when sim load allows; still report `skipped` honestly when the host is overloaded.

## Commands

```bash
# Production SaaS probe (ntfy on state change)
bash ~/.hermes/bin/saas-watchdog.sh

# Health + client error counter
curl -sS https://thumbgate.app/api/health | jq '.telemetry.clientErrorsToday'

# Reliability gate (shell + optional D1)
node tools/verify-thumbgate-web-reliability.js
```

## 2026-07-26 monitoring upgrades

1. **`clientErrorsToday` spike → ntfy** — `saas/saas-watchdog.sh` treats spike (≥ `SAAS_WATCHDOG_CLIENT_ERROR_SPIKE`, default 15) as **yellow** (ntfy title `ThumbGate client errors spike`). Soft only: does **not** fail the hard probe alone.
2. **Redacted web error class** — `ClientErrorBeacon` posts allowlisted `errorClass` (`TypeError`, etc.); analytics dual-writes `client_error_class_*` counters. Still **no** stack, message, or URL query.
3. **Continuous E2E yellow SLO** — `run-continuous-e2e.sh` writes `slo: green|yellow|red` and ntfys on transition; `tools/continuous-e2e-slo-watch.js` can re-evaluate `latest.json` for LaunchAgent/cron.

## Gaps still open

- No full stack traces for web (privacy/content-free design by choice).
- No multi-region synthetic platform (Checkly-class); GH live-smoke + local watchdog only.
- No SLO burn-rate auto-rollback of Worker (operator uses `tools/hermes-control-plane-rollback.js` when merged).
- Mobile continuous E2E still often skips when physical phone is in use (now **yellow**, not silent).
- Sentry source maps still `SENTRY_DISABLE_AUTO_UPLOAD=true` on production builds.
