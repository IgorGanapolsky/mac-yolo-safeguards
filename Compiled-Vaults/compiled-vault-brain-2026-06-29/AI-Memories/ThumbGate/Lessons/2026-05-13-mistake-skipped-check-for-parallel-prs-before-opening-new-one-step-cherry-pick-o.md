---
title: "MISTAKE: Skipped 'check for parallel PRs before opening new one' step. Cherry-pick on the wrong branch caused noisy rebase..."
date: 2026-05-13
category: error
promoted: true
linkedRules: []
linkedGates: []
---

# MISTAKE: Skipped 'check for parallel PRs before opening new one' step. Cherry-pick on the wrong branch caused noisy rebase...

## Corrective Action

What went wrong: Skipped 'check for parallel PRs before opening new one' step. Cherry-pick on the wrong branch caused noisy rebase artifacts in my PR (extra files from protobufjs + directSocial commits), making it strictly worse than #1972.
How to avoid: BEFORE opening a new PR on a high-level topic (federal, security, observability), run: gh pr list --state open --search 'in:title <topic>' to detect parallel work. If a parallel PR exists with same intent, contribute to it instead of opening a duplicate.

## Tags

[[feedback]], [[negative]], [[pr-hygiene]], [[parallel-agents]], [[coordination]], [[collision-avoidance]]

## Source

Backlink: [[Feedback/fb_1778681202066_nqtcp2]]
