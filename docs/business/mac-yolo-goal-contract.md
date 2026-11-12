# Mac YOLO Safeguards: Business Goal Contract

Version 1, 2026-11-11. Covers Mac YOLO Safeguards only. ThumbGate and Dayglass have their own books and are not counted here, even though ThumbGate shares the Stripe account.

## Product and offer

Names follow the canonical table in `docs/landing/MACYOLOSAFEGUARDS-FUNNEL-FIXES.md`.

- Mac YOLO Safeguards (free): native macOS menu bar app (CPU, memory, swap and disk HUD; orphaned agent process cleanup; AI and dev cache cleaner). Download at https://macyolosafeguards.io/go/dmg.
- Mac YOLO Pro Guard, $19/month, Stripe https://buy.stripe.com/cNi6oH1M81eSg4pdKz3sJ10.
- Agent Reliability Diagnostic, $499 once, Stripe https://buy.stripe.com/dRmeVd9eA4r4aK5gWL3sJ0Y.
- AI Agent Hardening Sprint, $1,500 once, Stripe https://buy.stripe.com/4gM28r1M8g9M3hD0XN3sI38.
- Partner Pilot, $3,000 once, Stripe https://buy.stripe.com/9B6eVdcqM7DgcSdayn3sJ0Z (reached through https://macyolosafeguards.io/go/pilot, not shown on the landing page).

## Customer

Developers who run Claude Code, Cursor, Codex or similar agents for hours on Apple Silicon Macs and lose time to freezes, swap and disk exhaustion.

## Systems of record

- Cash: Stripe account acct_1RNcJ1GGBpd520QY (filter to Mac YOLO products) and Gumroad. Nothing else counts as revenue.
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
