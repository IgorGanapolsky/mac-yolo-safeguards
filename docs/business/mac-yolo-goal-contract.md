# Mac YOLO Safeguards: Business Goal Contract

Version 2, 2026-11-13 (version 1, 2026-11-11, priced Pro at $19/month on the old Stripe account). Covers Mac YOLO Safeguards only. ThumbGate and Dayglass have their own books and are not counted here, even though ThumbGate shares the Stripe account.

## Product and offer

Names follow the canonical table in `docs/landing/MACYOLOSAFEGUARDS-FUNNEL-FIXES.md`.

- Mac YOLO Safeguards (free): native macOS menu bar app (CPU, memory, swap and disk HUD; orphaned agent process cleanup; AI and dev cache cleaner). Download at https://macyolosafeguards.io/go/dmg.
- Mac YOLO Pro Guard, $29 once with a 30-day refund, Stripe product `prod_VcKHHMGt37YyIp`, link https://buy.stripe.com/00weVegjK9lBeVN9I3f3a05. Every Pro route (`/go/pro`, `/go/pro-once`, `/go/monthly`, `/go/annual` and the in-app button in v1.2.2) goes there. The $19/month and $59/year plans are retired.
- Agent Reliability Diagnostic $499 (`/go/triage`), AI Agent Hardening Sprint $1,500 (`/go/sprint`), Partner Pilot $3,000 (`/go/pilot`, not on the landing page). Links live in `apps/macyolosafeguards-site/src/worker.js`.
- Agent Safeguards Playbook, $9.99 once, Gumroad https://iganapolsky.gumroad.com/l/odrkon.
- Corporate-Expense Reliability Kit, $49 once, Gumroad https://iganapolsky.gumroad.com/l/vcrho.

## Customer

Developers who run Claude Code, Cursor, Codex or similar agents for hours on Apple Silicon Macs and lose time to freezes, swap and disk exhaustion.

## Systems of record

- Cash: Stripe account acct_1UVwVAK8kufMLNF8 ("mac-yolo-safeguards", Mac YOLO only) and Gumroad. The older account acct_1RNcJ1GGBpd520QY holds the Nov 10-11 pilot attempts. Nothing else counts as revenue.
- Source of each sale: `/go/*?from=<source>` sets Stripe `client_reference_id` (PR #2362). The ChatGPT ad uses `from=chatgpt_ads`.
- Downloads: GitHub release asset download counts.
- Traffic: GitHub traffic API, and Cloudflare Web Analytics for macyolosafeguards.io (beacon added to the site on 2026-11-11).
- `yolo_revenue_observability` reports receipt files only and does not measure cash.

## Baseline, measured 2026-11-11 12:00 PM ET

| Measure | Value | Source |
|---|---|---|
| Paid orders from outside customers, all time | 0 | Stripe payments list (all succeeded charges are the owner's own email), Gumroad sales |
| Gumroad sales, last 30 days | 0 from 158 product views | Gumroad analytics |
| Installer downloads, v1.0.0 and v1.1.0 | about 60 dmg/pkg, about 6 zip | GitHub release counters |
| Repo unique visitors, 14 days | 471, of which 415 from aocr.org (bot referrer, see lessons) | GitHub traffic API |
| Gatekeeper-clean downloads | all except the v1.0.0 Setapp zip | tools/release-gatekeeper-check.sh |

Source coverage: PARTIAL. Stripe and Gumroad were read through the dashboard, not reconciled exports; there are no site analytics.

## Checkpoint, 2026-11-13 11:30 AM ET

| Measure | Value | Source |
|---|---|---|
| Payments on acct_1UVwVAK8kufMLNF8, all time | 0 (no successful, failed or refunded payment) | Stripe dashboard, Payments |
| Net settled revenue | $0.00 | same |
| v1.2.2 downloads since release this morning | 3 dmg, 2 pkg, 2 zip | GitHub release counters |
| Checkout link | HTTP 200; `/go/pro-once?from=chatgpt_ads` redirects with `client_reference_id=chatgpt_ads` | plain HTTP GET, no browser |

Source coverage: Stripe COMPLETE for this account; Gumroad not re-read since 2026-11-11 (STALE). Contribution profit is not determinable: spend on agents and the Apple Developer account is not yet allocated to this business.

## Targets and budget

Set by the owner on 2026-11-11:

- 3 paying Mac YOLO Pro Guard customers (outside buyers, not the owner) by 2026-12-15.
- $0 paid acquisition until at least one outside visitor completes a paid order. Launch promotion is unpaid: Product Hunt, Show HN, r/ClaudeAI.

## Current priorities

1. Product Hunt launch, Sat 2026-11-14 12:01 AM PT (scheduled, page producthunt.com/products/mac-yolo-safeguards).
2. Find out why visitors do not pay: no outside visitor has ever completed a paid order.
3. Keep every public download passing Gatekeeper before any announcement.

## Lessons

- 2026-11-11, validated: v1.0.0 .pkg was signed with the Mac App Store installer identity and v1.1.0 zip was not notarized, so macOS blocked them for every downloader. Fixed and replaced; `release-gatekeeper-check.sh` now gates releases.
- 2026-11-11, validated: the revenue MCP tool returned hand-typed numbers that agents quoted as live. Fixed in PR #2291. Read Stripe and Gumroad directly.
- 2026-11-11, hypothesis with strong evidence: aocr.org (a radiology society, no links to this project) sends 88% of repo "visitors". Treat it as referrer spam and exclude it from funnel numbers.
- 2026-11-12, validated: the first outside buying intent. One buyer, who isn't in our contacts or the owner's mail, started the $3,000 Partner Pilot checkout (`/go/pilot`) twice, on Nov 10 at 10:47 AM and Nov 11 at 2:04 AM ET, with the same card both times. Each attempt stopped at the bank's 3D Secure check and expired 24 hours later unpaid (Stripe payments `pi_3UaCaHGGBpd520QY0Gq2RcuB` and `pi_3UaQtgGGBpd520QY0jEK3PtX`). Nothing in our system alerts on an abandoned high-value checkout, so it went unnoticed for two days. Large one-time offers need a payment path that avoids card 3D Secure (invoice or bank transfer) and an alert on abandoned checkouts.
- 2026-11-12, validated: Pro purchase to unlock works end to end in Stripe test mode (PR #2314). The live path differs only in keys and the payment link, which were checked separately.
- 2026-11-13, validated: published prices drifted. The app, the site, the README and three directory listings showed $19/month, $59/year, $29 once and a 14-day refund at the same time. Site and app fixed in PRs #2360 and #2361 and release v1.2.2; the Claude Code Agents, MacPip and MacWorthy listings were still stale at 11:00 AM and were sent to Instinct to correct.
- 2026-11-13, validated: Stripe Payment Links drop unknown query parameters, so `?from=` never reached Stripe and no sale could be traced to a channel. Fixed in PR #2362 by copying the source into `client_reference_id`.
- 2026-11-13, validated: on the $20 ChatGPT Plus plan, one long Codex job used about 82% of the day's 5-hour limit in 20 minutes. Codex is for short one-file jobs only.
