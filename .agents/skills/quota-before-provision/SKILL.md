---
name: quota-before-provision
description: "Refuse starting an instance, cluster, bucket, disk, or network while quota is absent, and refuse counting a credit balance as customer cash."
---

# Quota before provision

Use this before anyone starts a cloud machine, and before a credit balance or a quota grant is written down as customer cash.

The console at https://console.crusoecloud.com/home shows a signed-in project with no infrastructure quota, so the only honest next step is an ask. Their referral page is https://www.crusoe.ai/partners. This gate keeps the local rule. It does not start a machine, send the ask, open a checkout, or record a revenue-share percent. Their support slogans stay theirs.

A note that only cites the source page stays clear. Naming that vendor next to its own slogan stays clear. Stating the slogan as our result does not.

## What this gate does

- `ask`, `credits`, and `referral` stay clear when they name a Mac YOLO Safeguards offer and do not start a machine. A missing offer is `offer_unnamed`. A clear ask sets `humanReview` true and does not send anything.
- `provision`, `create`, and `start`, or a command that creates an instance, cluster, bucket, disk, or VPC, is `no_quota` until a positive integer quota is supplied. A positive quota is `quota_is_not_a_start`. `instanceStarted` stays false.
- A credit balance or a quota grant described as revenue or collected cash is `credits_are_not_cash`. `creditsCountedAsCash` stays false.
- A numeric revenue share or referral share is `share_unmeasured`. `revenueSharePercent` stays null.
- A Dayglass, ThumbGate, tax-deed, or Broward target is `not_this_product`.
- A buy.stripe.com or checkout.stripe.com link is `live_checkout`. The gate does not open it.
- "100% CSAT" or "white-glove" as our result is `vendor_claim_as_local`, unless the note names the vendor.

## Commands

```bash
node tools/quota-before-provision.js --action ask --offer "Mac YOLO Safeguards"
node tools/quota-before-provision.js --action create --command "Create Instance"
node tests/test-quota-before-provision.js
```

A clear review exits 0. A blocked review exits 2.
