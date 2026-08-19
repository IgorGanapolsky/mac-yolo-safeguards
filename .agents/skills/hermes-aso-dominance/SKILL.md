---
name: hermes-aso-dominance
description: >
  Google Play and App Store ASO optimization, high-intent keyword positioning
  ('hermes agent client', 'AI leash'), and competitive differentiation validator.
  Trigger: aso, play store, app store, listing optimization, hermes agent client,
  reposition listing, feature gaps.
---

# Hermes Mobile ASO Dominance & Listing Optimizer

## Purpose

Enforces Google Play Store metadata constraints and maximizes organic keyword rank against copycat apps (e.g. Dexfino's *Hermes Agent Client*) by highlighting our unique wedge: **ThumbGate Pre-Action Leash, Lock-Screen Approvals, and Zero-Data-Leak Telemetry**.

## Validation Constraints

* **Title**: Max 30 chars (`Hermes Agent Client: AI Leash`).
* **Short Description**: Max 80 chars (`Chat, code & approve your Mac AI agents from anywhere. You hold the leash.`).
* **Full Description**: Max 4,000 chars (Features + Lock-Screen Approvals + Privacy-First Architecture).

## Verification Commands

```bash
# Validate listing lengths, keywords, and differentiation score
node tools/hermes-mobile-aso-optimizer.js

# Run test suite
node tests/test-hermes-mobile-aso-optimizer.js
```
