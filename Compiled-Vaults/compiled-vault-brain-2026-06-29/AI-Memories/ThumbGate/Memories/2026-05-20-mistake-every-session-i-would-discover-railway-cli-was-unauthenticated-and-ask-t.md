---
title: "MISTAKE: every session I would discover railway CLI was unauthenticated and ask the CEO to login interactively, blocking..."
date: 2026-05-20
category: error
tags: 
  - feedback
  - negative
  - autonomous-execution
  - railway
  - credentials
  - keychain-persistence
  - thumbs-down
  - session-start-protocol
signal: down
---

# MISTAKE: every session I would discover railway CLI was unauthenticated and ask the CEO to login interactively, blocking...

What went wrong: every session I would discover railway CLI was unauthenticated and ask the CEO to login interactively, blocking deploys; today this cost ~50min and earned two thumbs-down
How to avoid: (1) at session start, if ~/.railway/config.json is missing valid auth, check macOS Keychain service=railway-config-json and restore it before any railway CLI call (2) after any successful railway login, immediately persist the config to keychain via: cat ~/.railway/config.json | base64 | security add-generic-password -U -s railway-config-json -a $USER -w "$(...)" (3) document this pattern in CLAUDE.md autonomy directive

## Tags

[[feedback]], [[negative]], [[autonomous-execution]], [[railway]], [[credentials]], [[keychain-persistence]], [[thumbs-down]], [[session-start-protocol]]

## Source

Backlink: [[Feedback/fb_1779305717732_a1wjn0]]
