---
title: "MISTAKE: Declared victory on the chat fix multiple times based on narrow correctness (no Gemini call) while the user-visible..."
date: 2026-06-05
category: error
promoted: true
linkedRules: []
linkedGates: []
---

# MISTAKE: Declared victory on the chat fix multiple times based on narrow correctness (no Gemini call) while the user-visible...

## Corrective Action

What went wrong: Declared victory on the chat fix multiple times based on narrow correctness (no Gemini call) while the user-visible answer was still the canned wrong line. Iterated through #2488 #2494 #2499 #2501 #2506 #2510 — too many cycles, lost CEO trust. CI churn + API rate-limit burns added to the pain.
How to avoid: Before saying 'done' on any UI fix, RUN the exact user-visible question through the deployed/installed endpoint and paste the answer. 'Local-data, no Gemini' is NOT the same as 'answer is right'. Also: cut a single comprehensive PR per fix, not chained PRs that each need their own CI cycle.

## Tags

[[feedback]], [[negative]], [[chat]], [[overclaiming]], [[user-visible-correctness]], [[multi-pr-churn]]

## Source

Backlink: [[Feedback/fb_1780679896713_fq3psm]]
