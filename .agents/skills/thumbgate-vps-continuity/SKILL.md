---
name: thumbgate-vps-continuity
description: ThumbGate 24/7 Fenced Cloud VPS Continuity Engine. Standard operating procedures for 90s renewable lease management, LLM-as-a-Judge pre-action validation, zero-Mac-pairing verification, and Cloudflare production deployments.
---

# ThumbGate VPS Continuity Skill

Enforces the **24/7 Fenced Cloud VPS Continuity Operating Model** on [ThumbGate.app](https://thumbgate.app/).

## Core Principles

1. **Continuity is the Product**: Fenced cloud VPS runner with 90-second renewable leases, state receipts, and zero client setup.
2. **Zero Mac Pairing Dependency**: Users do not need a Mac or desktop pairing to run Continuity.
3. **LLM-as-a-Judge PreToolUse Gates**: Sensitive actions (file deletion, financial requests, secret exfiltration) are verified by an LLM-as-a-Judge before execution.
4. **Transparent CoreWeave-Style Specs**: Real run limits, $10/mo Pro pricing, and zero surprise egress/idle charges.

## CLI Commands

```bash
# Audit VPS Continuity configuration & health
bin/vps-continuity doctor

# Verify live production deployment on thumbgate.app
bin/vps-continuity verify-live
```

## Programmatic Usage

```javascript
const {
  CONTINUITY_CONFIG,
  auditContinuityHealth,
  verifyLiveEndpoint,
} = require('./tools/thumbgate-vps-continuity');
```
