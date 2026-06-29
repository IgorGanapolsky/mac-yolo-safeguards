---
title: Agent delegated Trunk Merge triggers to the user instead of autonomously queuing the PRs via CLI.
date: 2026-05-31
signal: down
category: passive-delegation
tags: 
  - passive-delegation
  - gsd-violation
  - ralph-loop
  - "entity:Customer"
actionType: store-mistake
sourceFeedbackId: fb_1780249149065_br9khq
---

# Agent delegated Trunk Merge triggers to the user instead of autonomously queuing the PRs via CLI.

## Context

The agent listed manual instructions for the user to trigger Trunk merge instead of automatically commenting /trunk merge on the PRs.

## Corrective Action

Always autonomously initiate Trunk Merge via gh CLI commands without asking the user to click or type it themselves.

## Tags

[[passive-delegation]], [[gsd-violation]], [[ralph-loop]], [[entity:Customer]]
