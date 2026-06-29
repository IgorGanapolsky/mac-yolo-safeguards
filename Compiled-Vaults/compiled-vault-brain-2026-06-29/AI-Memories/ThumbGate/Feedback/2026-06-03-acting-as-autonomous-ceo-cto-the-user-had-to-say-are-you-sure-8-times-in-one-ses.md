---
title: Acting as autonomous CEO/CTO, the user had to say 'are you sure?' ~8 times in one session, each catching a real error, then asked 'do I need to babysit you?' and gave a thumbs-down.
date: 2026-06-03
signal: down
category: overclaiming
tags: 
  - overclaiming
  - verification
  - autonomy
  - trust
  - babysitting
  - "entity:Customer"
actionType: store-mistake
sourceFeedbackId: fb_1780503073074_1om4ep
---

# Acting as autonomous CEO/CTO, the user had to say 'are you sure?' ~8 times in one session, each catching a real error, then asked 'do I need to babysit you?' and gave a thumbs-down.

## Context

Repeatedly declared work done/verified against stale snapshots instead of the real execution path and live state: tested evaluateGates when the live hook runs runAsync; tested from the wrong cwd and got inverted results; asserted a competitor differentiation without reading their site; called a fixable bundle-ratchet an unfixable wall; claimed fixes 'landed' on an unmergeable branch. Made the CEO the verification layer.

## Corrective Action

Verify against the REAL execution path and live state before any claim. Lead with 'unverified' first, never let the CEO discover errors by asking twice. When a second agent is concurrently changing the repo, treat every snapshot as stale and re-check or say so.

## Tags

[[overclaiming]], [[verification]], [[autonomy]], [[trust]], [[babysitting]], [[entity:Customer]]
