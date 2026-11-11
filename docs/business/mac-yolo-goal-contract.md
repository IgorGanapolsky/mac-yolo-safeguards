# Mac YOLO Safeguards: Business Goal Contract

Version 1, 2026-11-11. Covers Mac YOLO Safeguards only. ThumbGate and Dayglass have their own books and are not counted here, even though ThumbGate shares the Stripe account.

## Product and offer

- Free: native macOS menu bar app (CPU, memory, swap and disk HUD; orphaned agent process cleanup; AI and dev cache cleaner). Download at https://macyolosafeguards.io/go/dmg.
- Pro Guard, $19/month, Stripe payment link https://buy.stripe.com/cNi6oH1M81eSg4pdKz3sJ10.
- Corporate-Expense Guard Kit, $49 one-time, Gumroad https://iganapolsky.gumroad.com/l/vcrho.
- Self-Serve Playbook, $9.99, Gumroad https://iganapolsky.gumroad.com/l/odrkon.
- Reliability Diagnostic ($499) and Hardening Sprint ($1,500), Stripe payment links on the site.

## Customer

Developers who run Claude Code, Cursor, Codex or similar agents for hours on Apple Silicon Macs and lose time to freezes, swap and disk exhaustion.

## Systems of record

- Cash: Stripe account acct_1RNcJ1GGBpd520QY (filter to Mac YOLO products) and Gumroad. Nothing else counts as revenue.
- Downloads: GitHub release asset download counts.
- Traffic: GitHub traffic API. No site analytics key is available locally.
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

Not set. Owner decision: first paying-customer target, monthly spend ceiling for acquisition, and model spend allocated to this product.

## Current priorities

1. Product Hunt launch, Sat 2026-11-14 12:01 AM PT (scheduled, page producthunt.com/products/mac-yolo-safeguards).
2. Find out why visitors do not pay: no outside visitor has ever completed checkout.
3. Keep every public download passing Gatekeeper before any announcement.

## Lessons

- 2026-11-11, validated: v1.0.0 .pkg was signed with the Mac App Store installer identity and v1.1.0 zip was not notarized, so macOS blocked them for every downloader. Fixed and replaced; `release-gatekeeper-check.sh` now gates releases.
- 2026-11-11, validated: the revenue MCP tool returned hand-typed numbers that agents quoted as live. Fixed in PR #2291. Read Stripe and Gumroad directly.
- 2026-11-11, hypothesis with strong evidence: aocr.org (a radiology society, no links to this project) sends 88% of repo "visitors". Treat it as referrer spam and exclude it from funnel numbers.
