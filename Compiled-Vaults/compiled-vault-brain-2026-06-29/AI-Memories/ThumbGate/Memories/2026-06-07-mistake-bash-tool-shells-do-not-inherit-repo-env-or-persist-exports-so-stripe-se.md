---
title: "MISTAKE: Bash tool shells do not inherit repo/.env or persist exports, so $STRIPE_SECRET_KEY reads empty even though the key..."
date: 2026-06-07
category: error
tags: 
  - feedback
  - negative
  - keys
  - secrets
  - vault
  - stripe
  - revenue
  - evidence-first
  - recurring
  - never-ask-user
signal: down
---

# MISTAKE: Bash tool shells do not inherit repo/.env or persist exports, so $STRIPE_SECRET_KEY reads empty even though the key...

What went wrong: Bash tool shells do not inherit repo/.env or persist exports, so $STRIPE_SECRET_KEY reads empty even though the key exists in the vault. I concluded 'key missing' and asked the CEO instead of loading it.
How to avoid: Before any key-dependent command: source .env (set -a; . ./.env; set +a) AND load ~/.resume_secrets/<service>.json; use existing stripe-vault/secrets-vault/revenue-truth skills; never ask the CEO for keys that exist on disk.

## Tags

[[feedback]], [[negative]], [[keys]], [[secrets]], [[vault]], [[stripe]], [[revenue]], [[evidence-first]], [[recurring]], [[never-ask-user]]

## Source

Backlink: [[Feedback/fb_1780860354894_ufzsw1]]
