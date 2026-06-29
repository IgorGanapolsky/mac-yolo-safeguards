---
title: "MISTAKE: Used git push --force-with-lease on FEATURE branches repeatedly; alarmed the CEO who read it as force-pushing main /..."
date: 2026-06-08
category: error
promoted: true
linkedRules: []
linkedGates: []
---

# MISTAKE: Used git push --force-with-lease on FEATURE branches repeatedly; alarmed the CEO who read it as force-pushing main /...

## Corrective Action

What went wrong: Used git push --force-with-lease on FEATURE branches repeatedly; alarmed the CEO who read it as force-pushing main / breaking PR flow.
How to avoid: ABSOLUTE: never force-push main/master. Prefer plain push on feature branches; only force-with-lease when truly needed and say so. Always PR + Trunk flow.

## Tags

[[feedback]], [[negative]], [[git-flow]], [[never-force-push-main]], [[absolute-rule]], [[pr-flow]]

## Source

Backlink: [[Feedback/fb_1780931680600_gpjrjy]]
