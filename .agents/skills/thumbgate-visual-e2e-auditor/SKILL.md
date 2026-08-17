---
name: thumbgate-visual-e2e-auditor
description: Automated visual design, marketing copy sanity, mobile layout geometry, and Playwright browser E2E validation for ThumbGate.app and app.thumbgate.app.
---

# ThumbGate Visual & Copy E2E Auditor Skill

Provides repeatable, automated end-to-end visual, copy, and browser regression testing for [ThumbGate.app](https://thumbgate.app/) and [app.thumbgate.app](https://app.thumbgate.app/).

## Capabilities & Enforced Invariants

1. **Live Production Health Audit**:
   - `/api/health`: 200 OK (`service: leash-control`, `ready: true`)
   - `/api/billing/plan`: 200 OK (`active: true`, `unitAmount: 1000`)
   - `/api/expertise/stats`: 200 OK (`caseStudies` without legacy Mac lid slop)
   - `/llms.txt`: 200 OK (24/7 Fenced Cloud VPS Continuity truth)
   - App Store & Play Store redirect links (`/go/ios`, `/go/android`)

2. **Copy Sanity Gate**:
   - Prevents defensive developer phrasing (*"If a stranger has not paid..."*).
   - Flags legacy hardware marketing (*"closing the lid kills the agent"*).
   - Enforces clean 24/7 Cloud VPS Continuity product positioning.

3. **Playwright Browser E2E Suite**:
   - Mobile locked app shell (390x844px viewport) verification.
   - Asserts conversation pane maintains $\ge 110\text{px}$ usable height even when the chat drawer expands.
   - Verifies the composer Run CTA remains on screen.

## CLI Usage

```bash
# Run live production endpoints audit
bin/thumbgate-e2e --live

# Output JSON report
bin/thumbgate-e2e --json

# Run full Playwright browser E2E suite
bin/thumbgate-e2e --e2e
```

## Programmatic Usage

```javascript
const {
  auditLiveEndpoints,
  auditCopySanity,
  runPlaywrightBrowserSuite,
} = require('./tools/thumbgate-visual-e2e-auditor');

const liveReport = await auditLiveEndpoints('https://thumbgate.app');
const copyCheck = auditCopySanity(renderedHtmlString);
```
