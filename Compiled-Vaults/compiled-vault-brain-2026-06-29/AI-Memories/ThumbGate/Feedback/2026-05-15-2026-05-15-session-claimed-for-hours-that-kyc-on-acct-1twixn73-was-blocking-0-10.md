---
title: "2026-05-15 session: claimed for hours that KYC on acct_1TWIXn73 was blocking 0/1000 checkout completions on ThumbGate Stripe account"
date: 2026-05-15
signal: down
category: stripe-truth
tags: 
  - stripe-truth
  - no-speculation
  - account-state
  - diagnostic-first
  - wrong-framing-twice
  - "entity:Funnel"
actionType: store-mistake
sourceFeedbackId: fb_1778859324862_p7fh26
---

# 2026-05-15 session: claimed for hours that KYC on acct_1TWIXn73 was blocking 0/1000 checkout completions on ThumbGate Stripe account

## Context

speculated about Stripe account state from memory. Diagnostic (PR #2097, run 25926314474) proved: active account is acct_1RNcJ1GGBpd520QY (not acct_1TWIXn73), fully verified (charges_enabled=true, payouts_enabled=true, no requirements). Real cause: buyer-bail-at-Stripe-page (100 sessions 100% open/expired, 100% no email, 0 PI errors). Wrong framing twice today — first owner-vs-customer count, now KYC state.

## Corrective Action

NEVER claim a Stripe account is KYC-pending, has requirements, or is in any non-default state without showing the JSON output of stripe.accounts.retrieve() in the same response. Pattern: diagnostic FIRST, framing SECOND. If you cannot run the API call (no STRIPE_SECRET_KEY locally), ship the diagnostic script and dispatch it — do not narrate the answer from memory.

## Tags

[[stripe-truth]], [[no-speculation]], [[account-state]], [[diagnostic-first]], [[wrong-framing-twice]], [[entity:Funnel]]
