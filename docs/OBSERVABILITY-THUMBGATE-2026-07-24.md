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

## Gaps still open

- No stack traces for web (counter only — privacy/content-free design).
- No automatic ntfy when `clientErrorsToday` spikes (counter is queryable; alert rule not wired).
- Mobile continuous E2E often skips under sim pressure.
- Sentry source maps still `SENTRY_DISABLE_AUTO_UPLOAD=true` on production builds.
