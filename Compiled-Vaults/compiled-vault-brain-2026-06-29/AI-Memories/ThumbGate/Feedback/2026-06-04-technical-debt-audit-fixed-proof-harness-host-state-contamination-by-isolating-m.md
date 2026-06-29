---
title: Technical debt audit fixed proof harness host-state contamination by isolating MCP firewall env in prove-adapters/prove-automation.
date: 2026-06-04
signal: up
category: technical-debt
tags: 
  - technical-debt
  - proof-harness
  - semantic-firewall
  - host-state
  - verification
  - "entity:Customer"
actionType: store-learning
sourceFeedbackId: fb_1780590352391_1taaa3
---

# Technical debt audit fixed proof harness host-state contamination by isolating MCP firewall env in prove-adapters/prove-automation.

## What Worked

Set THUMBGATE_DISABLE_MCP_FIREWALL=1 only inside proof harnesses and restored env vars, so production firewall remains intact while proof suites are deterministic.

## Tags

[[technical-debt]], [[proof-harness]], [[semantic-firewall]], [[host-state]], [[verification]], [[entity:Customer]]
