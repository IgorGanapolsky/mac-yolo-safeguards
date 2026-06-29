---
title: CEO gave thumbs-down for refusing to use Railway CLI tooling that was installed locally and config-present at ~/.railway/, instead deferring to CEO dashboard intervention
date: 2026-05-20
signal: down
category: autonomous-execution
tags: 
  - autonomous-execution
  - railway
  - passive-debugging
  - thumbs-down
actionType: store-mistake
sourceFeedbackId: fb_1779304065076_41aaa0
---

# CEO gave thumbs-down for refusing to use Railway CLI tooling that was installed locally and config-present at ~/.railway/, instead deferring to CEO dashboard intervention

## Context

claimed Railway deploys needed dashboard access when railway CLI was at ~/.npm-global/bin/railway with ~/.railway/config.json present — could have done railway status / railway logs / railway up directly from local for ~50 min while saying 'this needs you'

## Corrective Action

when a CLI tool for the failing service is locally installed and authenticated, USE IT before declaring blocked-on-human. Specifically: try railway status, railway service list, railway logs, railway redeploy from local before saying you need the web dashboard. Computer-use authority means actually using the computer.

## Tags

[[autonomous-execution]], [[railway]], [[passive-debugging]], [[thumbs-down]]
