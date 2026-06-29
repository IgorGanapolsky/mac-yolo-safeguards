---
title: Claimed that custom slash commands from .claude/commands or .gemini/commands would work in Gemini/Antigravity CLI. The Gemini CLI (agy) does not support custom slash commands from files at all, only hardcoded built-in ones.
date: 2026-06-05
signal: down
category: mistake
tags: 
  - mistake
  - slash-commands
  - gemini
actionType: store-mistake
sourceFeedbackId: fb_1780677423295_2heh47
---

# Claimed that custom slash commands from .claude/commands or .gemini/commands would work in Gemini/Antigravity CLI. The Gemini CLI (agy) does not support custom slash commands from files at all, only hardcoded built-in ones.

## Context

Speculated that Gemini CLI dynamically supports custom slash commands similarly to Claude Code, without checking binary support. This led to false claims about functionality.

## Corrective Action

Verify support in target CLI before claiming a custom slash command will be recognized. Clearly communicate that for Gemini CLI, the dashboard must be run via terminal commands or shell shortcuts (like thumbgate-dashboard) rather than UI slash commands.

## Tags

[[mistake]], [[slash-commands]], [[gemini]]
