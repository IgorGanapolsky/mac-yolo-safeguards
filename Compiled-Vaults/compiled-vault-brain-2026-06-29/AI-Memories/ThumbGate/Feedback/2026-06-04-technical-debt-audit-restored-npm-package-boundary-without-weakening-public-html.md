---
title: Technical debt audit restored npm package boundary without weakening public HTML parity; package count stayed at 285 by excluding .claude-plugin/marketplace.json while keeping public/about.html packaged.
date: 2026-06-04
signal: up
category: technical-debt
tags: 
  - technical-debt
  - package-ratchet
  - moat
  - public-core-boundary
actionType: store-learning
sourceFeedbackId: fb_1780587120276_y37l8i
---

# Technical debt audit restored npm package boundary without weakening public HTML parity; package count stayed at 285 by excluding .claude-plugin/marketplace.json while keeping public/about.html packaged.

## What Worked

Resolve conflicting ratchets by trimming non-runtime marketplace metadata from npm package instead of removing buyer-facing public HTML or raising the ceiling.

## Tags

[[technical-debt]], [[package-ratchet]], [[moat]], [[public-core-boundary]]
