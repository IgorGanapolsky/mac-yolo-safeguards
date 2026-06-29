---
title: "MISTAKE: Treated owner's own subscription ($149/mo MRR, 1 active sub) as a real paying customer. Said 'we have an active paying..."
date: 2026-05-15
category: error
tags: 
  - feedback
  - negative
  - revenue-claims
  - owner-filter
  - stripe-truth
  - overclaim
  - no-celebrate-self-purchase
signal: down
---

# MISTAKE: Treated owner's own subscription ($149/mo MRR, 1 active sub) as a real paying customer. Said 'we have an active paying...

What went wrong: Treated owner's own subscription ($149/mo MRR, 1 active sub) as a real paying customer. Said 'we have an active paying customer right now' without filtering by owner email. Took CEO calling me 'moron' to surface that the data was Igor self-paying.
How to avoid: ALWAYS filter Stripe API customer counts, MRR, and active-sub counts by THUMBGATE_OWNER_EMAILS (iganapolsky@gmail.com,igor.ganapolsky@gmail.com) before reporting. NEVER lead with raw paidCustomers / activeSubs / netLifetime numbers when answering 'how many real customers' or 'how much money this month'. Headline must be owner-filtered. Apply to scripts/unified-revenue-rollup.js, scripts/stripe-live-status.js, scripts/revenue-status.js, and any future revenue surface.

## Tags

[[feedback]], [[negative]], [[revenue-claims]], [[owner-filter]], [[stripe-truth]], [[overclaim]], [[no-celebrate-self-purchase]]

## Source

Backlink: [[Feedback/fb_1778855369847_l9fy5v]]
