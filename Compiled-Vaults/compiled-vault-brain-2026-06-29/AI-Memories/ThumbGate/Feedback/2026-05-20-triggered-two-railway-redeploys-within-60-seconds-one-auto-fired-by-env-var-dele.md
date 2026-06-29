---
title: Triggered two Railway redeploys within 60 seconds (one auto-fired by env var deletion, one I manually fired via railway redeploy). The second deploy cancelled the first mid-flight and then itself FAILED, leaving prod returning HTTP 502 for 4+ minutes.
date: 2026-05-20
signal: down
category: autonomous-execution
tags: 
  - autonomous-execution
  - railway
  - prod-incident
  - deploy-racing
  - thumbs-down-self-reported
  - "entity:Customer"
actionType: store-mistake
sourceFeedbackId: fb_1779309387656_vct2o0
---

# Triggered two Railway redeploys within 60 seconds (one auto-fired by env var deletion, one I manually fired via railway redeploy). The second deploy cancelled the first mid-flight and then itself FAILED, leaving prod returning HTTP 502 for 4+ minutes.

## Context

overlapping Railway redeploys race each other; the second can kill the first's container before the first reaches healthy state. Compounded with a failed second deploy, prod ends up with no healthy container.

## Corrective Action

(1) After triggering any Railway action that causes a deploy (env var set/delete, redeploy, up), WAIT for that deploy to reach a terminal state (SUCCESS/FAILED/REMOVED) BEFORE triggering another. Use Monitor with poll loop on deployment status; don't fire-and-forget. (2) Same principle for any deploy pipeline that does blue-green rotation: respect the rotation window. (3) When deleting env vars on Railway, use --skip-deploys to defer the redeploy, batch the deletes, then trigger ONE deploy at the end.

## Tags

[[autonomous-execution]], [[railway]], [[prod-incident]], [[deploy-racing]], [[thumbs-down-self-reported]], [[entity:Customer]]
