---
name: cloudflare-quota-guard
description: >
  Autonomous Cloudflare Workers & API quota protection, tight-loop interdiction,
  and exponential backoff enforcement. Prevents burning the 100k daily request limit.
  Trigger: cloudflare, workers daily limit, request limit exceeded, 90% usage,
  quota guard, background polling loop, unthrottled loop.
---

# Cloudflare Quota Guard & Loop Interdiction

## Purpose & Invariants

Protects Cloudflare Workers Free Tier quotas (100,000 requests/day) and third-party APIs from runaway background loops, unthrottled reconnects, and dead-auth polling storms.

## Core Rules

1. **Mandatory Exponential Backoff**: Any network failure, 401 Unauthorized, 403 Forbidden, or pairing expiration MUST sleep for a minimum of 30 seconds before retrying.
2. **No KeepAlive Tight-Loops**: LaunchAgents with `KeepAlive: true` must never run scripts with `<5s` loop intervals without backoff.
3. **LaunchAgent Audit**: Run `node tools/cloudflare-quota-guard.js` on any configuration or agent change to verify 0 unthrottled quota risks.

## Verification Commands

```bash
# Audit all active LaunchAgents for quota risks
node tools/cloudflare-quota-guard.js

# Test cloud connector error backoff
node tests/test-hermes-cloud-connector.js
```
