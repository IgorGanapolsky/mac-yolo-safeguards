---
name: opt-before-scale
description: "Refuse scale, ad, or traffic spend until outside clients, average collected cents, and repeat payers are measured, and refuse a property or private-credit action."
---

# Opt before scale

Use this before anyone scales ads, traffic, or spend, and before a note treats a curriculum growth or margin figure as our result.

The idea taken from https://www.tonyrobbins.com/events/business-mastery is that three levers multiply, so a leak gets fixed before more traffic is bought. Related pages: https://www.tonyrobbins.com/blog/ai-advantage-summit and https://www.tonyrobbins.com/podcasts/holy-grail. This gate keeps the local rule. It does not spend, buy traffic, open a checkout, price a new tier, or underwrite property. Their percents stay theirs. Local growth and margin fields stay null.

A note that only cites the source page stays clear. Naming that curriculum next to its own percent stays clear. Stating the percent as our result does not.

## What this gate does

- `measure` and `opt` stay clear when they name a Mac YOLO Safeguards offer. A missing offer is `offer_unnamed`.
- `scale`, `maximize`, `ads`, `traffic`, and `spend` are `levers_unmeasured` until outside clients are at least 1, average collected cents are above 0, and repeat payers are at least 1. Founder addresses do not count. A clear scale review sets `humanReview` true and does not start spend.
- A property action, a 1031, private credit, a letter of intent, or a Dayglass, ThumbGate, or tax-deed target is `not_this_product`.
- A buy.stripe.com or checkout.stripe.com link is `live_checkout`. The gate does not open it.
- "33.1%", "1.331", "30-50%", "30 to 50%", "375x", or "0.04/1M" as our result is `vendor_claim_as_local`, unless the note names the curriculum.
- `applied`, `spendStarted`, `trafficBought`, and `checkoutOpened` stay false. `localTopLineGrowth` and `localMarginExpansion` stay null.

## Commands

```bash
node tools/opt-before-scale.js --action measure --offer "Pro Guard"
node tools/opt-before-scale.js --action scale
node tests/test-opt-before-scale.js
```

A clear review exits 0. A blocked review exits 2.
