---
title: "CEO clicked stat cards on /lessons page (Active Rules / Critical / Actions Blocked / Approval Trend) and 'nothing happened'. I had claimed comprehensive E2E coverage from PR #2242 but only tested the DASHBOARD cards (Total/Positive/Negative/Gates), not the LESSONS-page cards. Two layers of failure: (1) the lessons-page click handlers technically work but don't scroll the tab content into view so the user sees no visible change; (2) my Playwright suite never covered the lessons-page stat tiles, so the gap shipped."
date: 2026-05-20
signal: down
category: e2e-test-coverage
tags: 
  - e2e-test-coverage
  - ux-feedback-loop
  - thumbs-down
  - silent-handler-no-op
  - scope-claim-vs-reality
  - "entity:Customer"
actionType: store-mistake
sourceFeedbackId: fb_1779314587686_rqj4uw
---

# CEO clicked stat cards on /lessons page (Active Rules / Critical / Actions Blocked / Approval Trend) and 'nothing happened'. I had claimed comprehensive E2E coverage from PR #2242 but only tested the DASHBOARD cards (Total/Positive/Negative/Gates), not the LESSONS-page cards. Two layers of failure: (1) the lessons-page click handlers technically work but don't scroll the tab content into view so the user sees no visible change; (2) my Playwright suite never covered the lessons-page stat tiles, so the gap shipped.

## Context

claimed 'thorough E2E testing' coverage when in fact tests only covered the SPECIFIC bug-fix surface (dashboard cards) and not the broader 'all clickable stat tiles in ThumbGate UI' surface the user mentally groups together

## Corrective Action

(1) when writing E2E tests for a clickable surface, enumerate ALL clickable surfaces in the same UI category (every stat-card, every tile, every nav item) and assert each one has a visible effect on click (URL change, scroll change, content change). (2) when writing tab-switching handlers, ALWAYS scrollIntoView the new tab content — switching tabs whose content is below the fold is a silent no-op from the user's perspective. (3) NEVER claim 'thorough' coverage on a test suite unless you've enumerated and exercised every clickable element in the surface area.

## Tags

[[e2e-test-coverage]], [[ux-feedback-loop]], [[thumbs-down]], [[silent-handler-no-op]], [[scope-claim-vs-reality]], [[entity:Customer]]
