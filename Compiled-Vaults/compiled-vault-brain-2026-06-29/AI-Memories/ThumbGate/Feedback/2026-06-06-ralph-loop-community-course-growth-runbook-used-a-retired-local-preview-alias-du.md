---
title: Ralph Loop community/course growth runbook used a retired local preview alias during Operator Lab promo verification
date: 2026-06-06
signal: down
category: community-growth
tags: 
  - community-growth
  - operator-lab
  - runbook-drift
  - feedback-capture
  - "entity:Customer"
actionType: store-mistake
sourceFeedbackId: fb_1780744364666_9l5hm5
---

# Ralph Loop community/course growth runbook used a retired local preview alias during Operator Lab promo verification

## Context

The old creator-platform-promo npm script is not present in this checkout, which caused a false verification failure before the canonical social publish dry-run was re-run.

## Corrective Action

Use npm run social:publish:launch -- --dry-run --offer=operator-lab --platforms=linkedin,instagram,threads,bluesky,reddit,youtube as the canonical local Operator Lab preview command and record it in automation memory/docs.

## Tags

[[community-growth]], [[operator-lab]], [[runbook-drift]], [[feedback-capture]], [[entity:Customer]]
