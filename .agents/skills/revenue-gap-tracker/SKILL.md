---
name: revenue-gap-tracker
description: Track revenue monitoring gaps on ThumbGate.app — identify blocked data sources (gitignored business_os/, admin auth, Stripe env vars), audit available signals, and determine what's needed to move revenue monitoring from 3→5.
version: 1
owner: claude-code
license: MIT
trigger: "revenue monitoring", "revenue gap", "business_os", "Stripe env vars", "revenue 3 to 5", "revenue not met"
health_check: "`node tools/revenue-goal-audit.js` reports Ledgers > 0 and Target status: MET"
---

# Revenue Gap Tracker Skill

Use this skill whenever revenue monitoring is blocked, stalled, or needs
verification against live production data.

## Quick Commands

| Action | Command |
|--------|---------|
| Audit revenue goals | `node tools/revenue-goal-audit.js --no-auto-send` |
| Autonomous revenue loop | `node tools/revenue-autonomous-loop.js --no-auto-send --fast --json` |
| Check public health endpoint | `curl -s -H "User-Agent: Mozilla/5.0" https://app.thumbgate.app/api/health \| jq .telemetry` |
| Check admin auth | `source .env.local && curl -H "Authorization: Bearer $TOKEN" ...` |

## Known Data Sources & Access Patterns

### Public (no auth required)
- `https://app.thumbgate.app/api/health` → `telemetry.paidOrganizationsTotal`,
  `telemetry.realBillingEventLatestAt`, `billingEventsLast24h`
- Revenue anomaly watchdog reads this same public endpoint:
  `.github/workflows/revenue-anomaly-watch.yml`

### Private (requires access)
- `business_os/` (gitignored) → local ops data ledgers, revenue calculations
- Stripe API (`STRIPE_SECRET_KEY`) → live billing events, MRR, churn
- Admin dashboard cookies → authenticated API endpoints
- D1 database direct access → `billing_events`, `organizations` tables

## Gap Audit

| Component | Current State | Gap |
|-----------|--------------|-----|
| Live telemetry | Available via public `/api/health` | Shows 0 paid orgs → likely a test/staging DB, not production billing data |
| Revenue goal audit | `tools/revenue-goal-audit.js` → "Ledgers discovered: 0, Net after reserve: $0.00, Target status: NOT MET" | `business_os/` is gitignored — no access from agent environment |
| Stripe env vars | `STRIPE_SECRET_KEY` not in env | Cannot run revenue autonomous loop against live data |
| Admin metrics | `lib/admin-metrics.ts` exports `revenue.paidOrganizations`, `projectedMrrUsd` ($10/mo list price) | Backend admin API requires session cookies (Google SSO) — use BrowserOS |
| Funnel attribution | `lib/funnel-attribution.ts` — allowlisted UTM/CTA tokens, no PII | ✅ Working, feeds into admin metrics |

## Unblock Checklist

1. **BrowserOS → admin dashboard:** Navigate `app.thumbgate.app/dashboard` using
   BrowserOS (Google SSO `iganapolsky@gmail.com` session) and read the live
   `paidOrganizations` and `projectedMrrUsd` values.
2. **BrowserOS → Stripe dashboard:** Navigate `dash.stripe.com` (same SSO) and
   verify MRR, churn rate, and billing event volume for the production account.
3. **Revenue audit re-run:** After confirming live values via BrowserOS, re-run
   `node tools/revenue-goal-audit.js --no-auto-send` to update target status.
4. **Gap closure:** If live values meet the target threshold, mark the revenue
   monitoring axis as 5/5 in the plan.

## Notes

- `business_os/` is gitignored by design — internal ops data never in tracked repo.
- The `STRIPE_SECRET_KEY` env var cannot be accessed from the agent environment.
  Use BrowserOS to check `dash.stripe.com` instead.
- The public health endpoint telemetry values (paid orgs, billing events) reflect
  the **D1 database behind `app.thumbgate.app`**, which may be production or may be
  a staging/test DB. Cross-verify with Stripe dashboard via BrowserOS.
