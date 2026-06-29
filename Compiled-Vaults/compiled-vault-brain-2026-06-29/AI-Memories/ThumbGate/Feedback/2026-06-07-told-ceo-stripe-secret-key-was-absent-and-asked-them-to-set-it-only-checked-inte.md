---
title: Told CEO STRIPE_SECRET_KEY was absent and asked them to set it; only checked interactive shell $VAR, not .env or the ~/.resume_secrets vault. Recurring across sessions.
date: 2026-06-07
signal: down
category: keys
tags: 
  - keys
  - secrets
  - vault
  - stripe
  - revenue
  - evidence-first
  - recurring
  - never-ask-user
actionType: store-mistake
sourceFeedbackId: fb_1780860354894_ufzsw1
---

# Told CEO STRIPE_SECRET_KEY was absent and asked them to set it; only checked interactive shell $VAR, not .env or the ~/.resume_secrets vault. Recurring across sessions.

## Context

Bash tool shells do not inherit repo/.env or persist exports, so $STRIPE_SECRET_KEY reads empty even though the key exists in the vault. I concluded 'key missing' and asked the CEO instead of loading it.

## Corrective Action

Before any key-dependent command: source .env (set -a; . ./.env; set +a) AND load ~/.resume_secrets/<service>.json; use existing stripe-vault/secrets-vault/revenue-truth skills; never ask the CEO for keys that exist on disk.

## Tags

[[keys]], [[secrets]], [[vault]], [[stripe]], [[revenue]], [[evidence-first]], [[recurring]], [[never-ask-user]]
