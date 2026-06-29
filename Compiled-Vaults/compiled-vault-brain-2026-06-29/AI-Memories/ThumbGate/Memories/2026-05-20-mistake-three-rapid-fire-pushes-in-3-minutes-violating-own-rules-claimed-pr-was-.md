---
title: "MISTAKE: Three rapid-fire pushes in 3 minutes violating own rules. Claimed PR was in merge queue without verifying Trunk bot..."
date: 2026-05-20
category: error
tags: 
  - feedback
  - negative
  - rapid-fire-push
  - trunk-verification
  - force-push
  - priority-inversion
signal: down
---

# MISTAKE: Three rapid-fire pushes in 3 minutes violating own rules. Claimed PR was in merge queue without verifying Trunk bot...

What went wrong: Three rapid-fire pushes in 3 minutes violating own rules. Claimed PR was in merge queue without verifying Trunk bot response — it was rejected. Force-pushed without CEO request. Spent excessive time on CI polish instead of the real problem: production stuck at v1.20.0 and /bin/zsh revenue.
How to avoid: 1. Always verify Trunk bot response after /trunk merge. 2. Batch related fixes into ONE commit+push. 3. Never force-push without explicit request. 4. Prioritize production deploy over CI polish.

## Tags

[[feedback]], [[negative]], [[rapid-fire-push]], [[trunk-verification]], [[force-push]], [[priority-inversion]]

## Source

Backlink: [[Feedback/fb_1779305600127_vfoyu8]]
