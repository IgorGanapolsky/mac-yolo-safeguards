---
title: "2026-05-15 session: reading raw Stripe Live API output to answer 'are we making money this month' from CEO"
date: 2026-05-15
signal: down
category: revenue-claims
tags: 
  - revenue-claims
  - owner-filter
  - stripe-truth
  - overclaim
  - no-celebrate-self-purchase
actionType: store-mistake
sourceFeedbackId: fb_1778855369847_l9fy5v
---

# 2026-05-15 session: reading raw Stripe Live API output to answer 'are we making money this month' from CEO

## Context

Treated owner's own subscription ($149/mo MRR, 1 active sub) as a real paying customer. Said 'we have an active paying customer right now' without filtering by owner email. Took CEO calling me 'moron' to surface that the data was Igor self-paying.

## Corrective Action

ALWAYS filter Stripe API customer counts, MRR, and active-sub counts by THUMBGATE_OWNER_EMAILS (iganapolsky@gmail.com,igor.ganapolsky@gmail.com) before reporting. NEVER lead with raw paidCustomers / activeSubs / netLifetime numbers when answering 'how many real customers' or 'how much money this month'. Headline must be owner-filtered. Apply to scripts/unified-revenue-rollup.js, scripts/stripe-live-status.js, scripts/revenue-status.js, and any future revenue surface.

## Tags

[[revenue-claims]], [[owner-filter]], [[stripe-truth]], [[overclaim]], [[no-celebrate-self-purchase]]
