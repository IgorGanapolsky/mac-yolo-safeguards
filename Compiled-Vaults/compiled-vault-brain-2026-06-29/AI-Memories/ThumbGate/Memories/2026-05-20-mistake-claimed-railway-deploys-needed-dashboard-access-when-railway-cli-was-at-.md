---
title: "MISTAKE: claimed Railway deploys needed dashboard access when railway CLI was at ~/.npm-global/bin/railway with..."
date: 2026-05-20
category: error
tags: 
  - feedback
  - negative
  - autonomous-execution
  - railway
  - passive-debugging
  - thumbs-down
signal: down
---

# MISTAKE: claimed Railway deploys needed dashboard access when railway CLI was at ~/.npm-global/bin/railway with...

What went wrong: claimed Railway deploys needed dashboard access when railway CLI was at ~/.npm-global/bin/railway with ~/.railway/config.json present — could have done railway status / railway logs / railway up directly from local for ~50 min while saying 'this needs you'
How to avoid: when a CLI tool for the failing service is locally installed and authenticated, USE IT before declaring blocked-on-human. Specifically: try railway status, railway service list, railway logs, railway redeploy from local before saying you need the web dashboard. Computer-use authority means actually using the computer.

## Tags

[[feedback]], [[negative]], [[autonomous-execution]], [[railway]], [[passive-debugging]], [[thumbs-down]]

## Source

Backlink: [[Feedback/fb_1779304065076_41aaa0]]
