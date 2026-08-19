---
name: thumbgate-cursor-blog-engine
description: Autonomous Cursor-style technical blog generation, systems architecture drafting, and validation engine for ThumbGate.app and Hermes Cloud Continuity.
---

# ThumbGate.app Cursor-Style Technical Blog Engine

Use this skill when drafting, validating, or staging deep-dive engineering blogs for **ThumbGate.app** following the Cursor engineering blog playbook.

## The 4-Part Narrative Framework

1. **Visceral Bottleneck**: Lead with the concrete developer failure mode (e.g. laptop lid close / sleep killing long-running agent refactors).
2. **First-Principles Breakdown**: Explain why prompt guardrails, unconstrained background loops, and raw desktop hijacking fail.
3. **Systems Architecture**: Diagram and detail the concrete protocols (Signed Machine Pairing via Ed25519, Fenced Cloud VPS Sandboxes, Remote Web Leash, and WAL/CAS coordination).
4. **Verified Benchmarks & Product Moat**: Present quantitative reliability metrics leading to **ThumbGate.app** ($0 Web Control / $10 Pro Continuity).

## System Tooling & Verification

```bash
# Generate the latest engineering blog markdown
node tools/thumbgate-blog-engine.js --generate

# Validate content against compliance invariants and UTM requirements
node tools/thumbgate-blog-engine.js --verify

# Stage blog draft for publication
node tools/thumbgate-blog-engine.js --stage docs/social/drafts/thumbgate-app-cursor-style-blog.md

# Run the test suite
node tests/test-thumbgate-blog-engine.js
```

## Prohibited Claims & Boundaries
- Do not promise "seamless failover" or "always works" for every arbitrary process.
- Do not promote desktop cursor hijacking (`xdotool`, `cliclick`, `osascript` mouse grab).
- All web dashboard links must resolve to `https://thumbgate.app` with canonical UTM tracking.
