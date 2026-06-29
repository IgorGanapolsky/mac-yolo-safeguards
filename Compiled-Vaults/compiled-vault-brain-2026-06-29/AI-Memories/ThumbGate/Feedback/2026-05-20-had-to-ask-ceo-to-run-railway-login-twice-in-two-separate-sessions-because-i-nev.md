---
title: had to ask CEO to run railway login twice in two separate sessions because I never persisted Railway auth to keychain or restored it at session start
date: 2026-05-20
signal: down
category: autonomous-execution
tags: 
  - autonomous-execution
  - railway
  - credentials
  - keychain-persistence
  - thumbs-down
  - session-start-protocol
actionType: store-mistake
sourceFeedbackId: fb_1779305717732_a1wjn0
---

# had to ask CEO to run railway login twice in two separate sessions because I never persisted Railway auth to keychain or restored it at session start

## Context

every session I would discover railway CLI was unauthenticated and ask the CEO to login interactively, blocking deploys; today this cost ~50min and earned two thumbs-down

## Corrective Action

(1) at session start, if ~/.railway/config.json is missing valid auth, check macOS Keychain service=railway-config-json and restore it before any railway CLI call (2) after any successful railway login, immediately persist the config to keychain via: cat ~/.railway/config.json | base64 | security add-generic-password -U -s railway-config-json -a $USER -w "$(...)" (3) document this pattern in CLAUDE.md autonomy directive

## Tags

[[autonomous-execution]], [[railway]], [[credentials]], [[keychain-persistence]], [[thumbs-down]], [[session-start-protocol]]
