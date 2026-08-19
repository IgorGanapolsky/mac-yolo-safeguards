---
name: hidden-entry-not-brighttalk
description: >
  BrightTALK weekly-rec process steal: interest-ranked digest of hidden
  agent-tool-call entry points (PreToolUse unwired, dynamic tools, missing
  identity). Do not clone BrightTALK, SailPoint, Strike48, or ISO 42001.
  Trigger: brighttalk, hidden entry points, going agentic SOC, ISO 42001,
  interest digest, misconfigurations attackers rely on.
  Slash: /hidden-entry-not-brighttalk.
---

# Hidden entry points — steal the digest, not BrightTALK

The BrightTALK email (2026-08-19) is a weekly webinar rec digest.
ThumbGate already has PreToolUse + claw identity/dynamic-tool gates.
Do **not** clone the webinar platform or claim ISO 42001.

| NEVER | ALWAYS |
|-------|--------|
| BrightTALK / SailPoint / Strike48 product | `node tools/hidden-entry.js --json --demo` |
| Claim ISO 42001 certified | `iso42001Certified: false` |
| Load-all webinars as the digest | Interest-rank; drop vendor theater |
| New SOC / compliance SKU (ECI) | Map pitfalls to PreToolUse + identity |
| Treat review/webinar volume as the control | `autoApply: false` |

```bash
node tools/hidden-entry.js --json --demo
node tools/hidden-entry.js --json --repo
node tests/test-hidden-entry.js
```

`capturedRevenueUsd` stays 0.

Sibling PR #1868 already cloned ISO/SailPoint filenames — do not dual-edit those.
Existing `tools/brighttalk-feed-cron-ingestor.js` is sample-feed theater (10/10) — do not extend it.
