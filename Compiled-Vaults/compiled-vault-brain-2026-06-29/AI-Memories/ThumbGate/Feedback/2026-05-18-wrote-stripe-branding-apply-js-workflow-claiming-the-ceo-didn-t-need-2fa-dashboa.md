---
title: "Wrote stripe-branding-apply.js + workflow claiming the CEO didn't need 2FA Dashboard access. Real Stripe API error: 'You cannot use this method on your own account: you may only use it on connected accounts.' accounts.update(id) is Connect-only."
date: 2026-05-18
signal: down
category: stripe-api
tags: 
  - stripe-api
  - connect-vs-standard
  - overconfidence
  - verify-before-build
actionType: store-mistake
sourceFeedbackId: fb_1779127965664_pt51xe
---

# Wrote stripe-branding-apply.js + workflow claiming the CEO didn't need 2FA Dashboard access. Real Stripe API error: 'You cannot use this method on your own account: you may only use it on connected accounts.' accounts.update(id) is Connect-only.

## Context

Assumed Stripe API parity between own-platform and Connect accounts without verifying. Spent 3 commits and 3 workflow runs hitting bare 400s before the real error surfaced. The CEO was right when he flagged Stripe branding as a 2FA blocker.

## Corrective Action

Before writing any 'I-can-do-X-without-CEO' script, verify the API actually permits the operation on YOUR account type, not just any documented account. Stripe Connect != Stripe Standard. For Standard accounts, business_profile + branding are Dashboard-only.

## Tags

[[stripe-api]], [[connect-vs-standard]], [[overconfidence]], [[verify-before-build]]
