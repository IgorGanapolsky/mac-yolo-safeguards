---
name: live-dashboard-verify
description: Verify live ThumbGate.app service health, trace header propagation, and production deployment status using curl + BrowserOS.
version: 1
owner: claude-code
license: MIT
trigger:
  - "live dashboard"
  - "production health"
  - "verify deploy"
  - "trace headers"
  - "production verification"
  - "app.thumbgate.app health"
health_check: "curl -sI https://app.thumbgate.app/api/health returns HTTP 200 plus traceparent header present"
---

# Live Dashboard Verify Skill

Use this skill whenever you need to verify that a merged code change has been
deployed to production and is functioning correctly.

## Quick Commands

| Action | Command |
|--------|---------|
| Check health endpoint (headers + body) | `curl -sI -H "User-Agent: Mozilla/5.0" <URL>/api/health` |
| Check health endpoint (body only) | `curl -s -H "User-Agent: Mozilla/5.0" <URL>/api/health \| jq` |
| Verify trace headers | `curl -sI <URL>/api/health \| grep -iE 'traceparent\|x-trace-id'` |
| BrowserOS status | `node tools/browseros-agent-harness.js --status` |
| BrowserOS navigate | `node tools/browseros-agent-harness.js --navigate <URL>` |

## Decision Flow

1. **Find production URL:** Search repo for `app.thumbgate.app` or `*.thumbgate.app`:
   ```
   grep -rohE 'https://[a-z0-9.-]*\.thumbgate\.app[^"\' ]*' . --include='*.ts' --include='*.js' --include='*.json' | sort -u
   ```
2. **Check deployment:** Confirm the push-to-main workflow has run:
   ```
   gh api repos/<owner>/<repo>/actions/workflows/<workflow>.yml/runs \
     --jq '[.workflow_runs[] | select(.head_branch=="main")] | .[0]'
   ```
3. **Verify live endpoint:** Once the workflow completes with `conclusion: success`,
   `curl` the health endpoint and check for:
   - HTTP 200 status
   - `traceparent` header (W3C Trace Context)
   - `x-trace-id` header (custom)
   - JSON body with `ok: true`
4. **Rate limit handling:** Cloudflare may return HTTP 429. Wait 60s and retry.
   Use a browser User-Agent to avoid bot detection.

## Notes

- The health endpoint at `app.thumbgate.app/api/health` returns 200 when all
  required D1 migrations are present and all config flags (Stripe, WorkOS, etc.)
  are set. Returns 503 with `database: "unavailable"` if migrations are missing.
- Trace headers (`traceparent`, `x-trace-id`) are injected by `lib/tracing.ts`
  and propagated through API route handlers.
- If curl returns 429 but the deployment workflow shows success, the rate limit
  is Cloudflare-side — wait and retry rather than assuming deployment failed.
