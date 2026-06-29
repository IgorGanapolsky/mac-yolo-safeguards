---
title: Daily-log hook captured only 10 of ~50+ assistant turns today (80%+ miss rate). I shipped the hook earlier today, claimed it was working based on file existing, but didn't verify it captured every turn.
date: 2026-05-21
signal: down
category: hooks
tags: 
  - hooks
  - observability
  - daily-log
  - verification
actionType: store-mistake
sourceFeedbackId: fb_1779397361517_8djyob
---

# Daily-log hook captured only 10 of ~50+ assistant turns today (80%+ miss rate). I shipped the hook earlier today, claimed it was working based on file existing, but didn't verify it captured every turn.

## Context

Surfaced sparse coverage only after CEO pushed back ('are you sure?'). Should have measured turn-count vs entry-count immediately after shipping.

## Corrective Action

Add a diagnostic log line to ~/.claude/hooks/daily-log-append.sh that fires unconditionally on every invocation (separate file from the curated daily log), so we can measure invocation-count vs assistant-turn-count and prove whether the gap is hook-not-firing vs hook-failing-silently. Also: never claim 'X works' from existence alone — claim 'X captured N events of an expected M' with both numbers.

## Tags

[[hooks]], [[observability]], [[daily-log]], [[verification]]
