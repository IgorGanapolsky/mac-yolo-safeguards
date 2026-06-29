---
title: "MISTAKE: Surfaced sparse coverage only after CEO pushed back ('are you sure?'). Should have measured turn-count vs entry-count..."
date: 2026-05-21
category: error
tags: 
  - feedback
  - negative
  - hooks
  - observability
  - daily-log
  - verification
signal: down
---

# MISTAKE: Surfaced sparse coverage only after CEO pushed back ('are you sure?'). Should have measured turn-count vs entry-count...

What went wrong: Surfaced sparse coverage only after CEO pushed back ('are you sure?'). Should have measured turn-count vs entry-count immediately after shipping.
How to avoid: Add a diagnostic log line to ~/.claude/hooks/daily-log-append.sh that fires unconditionally on every invocation (separate file from the curated daily log), so we can measure invocation-count vs assistant-turn-count and prove whether the gap is hook-not-firing vs hook-failing-silently. Also: never claim 'X works' from existence alone — claim 'X captured N events of an expected M' with both numbers.

## Tags

[[feedback]], [[negative]], [[hooks]], [[observability]], [[daily-log]], [[verification]]

## Source

Backlink: [[Feedback/fb_1779397361517_8djyob]]
