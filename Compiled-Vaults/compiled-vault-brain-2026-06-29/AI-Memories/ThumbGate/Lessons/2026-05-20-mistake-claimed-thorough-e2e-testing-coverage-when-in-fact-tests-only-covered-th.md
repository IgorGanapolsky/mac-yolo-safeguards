---
title: "MISTAKE: claimed 'thorough E2E testing' coverage when in fact tests only covered the SPECIFIC bug-fix surface (dashboard cards)..."
date: 2026-05-20
category: error
promoted: true
linkedRules: []
linkedGates: []
---

# MISTAKE: claimed 'thorough E2E testing' coverage when in fact tests only covered the SPECIFIC bug-fix surface (dashboard cards)...

## Corrective Action

What went wrong: claimed 'thorough E2E testing' coverage when in fact tests only covered the SPECIFIC bug-fix surface (dashboard cards) and not the broader 'all clickable stat tiles in ThumbGate UI' surface the user mentally groups together
How to avoid: (1) when writing E2E tests for a clickable surface, enumerate ALL clickable surfaces in the same UI category (every stat-card, every tile, every nav item) and assert each one has a visible effect on click (URL change, scroll change, content change). (2) when writing tab-switching handlers, ALWAYS scrollIntoView the new tab content — switching tabs whose content is below the fold is a silent no-op from the user's perspective. (3) NEVER claim 'thorough' coverage on a test suite unless you've enumerated and exercised every clickable element in the surface area.

## Tags

[[feedback]], [[negative]], [[e2e-test-coverage]], [[ux-feedback-loop]], [[thumbs-down]], [[silent-handler-no-op]], [[scope-claim-vs-reality]], [[entity:Customer]]

## Source

Backlink: [[Feedback/fb_1779314587686_rqj4uw]]
