---
title: Diagnosed 'daily log hook missing 80% of turns' but the real cause was per-cwd partitioning. There were 5 daily log files for today (totaling ~111 entries) — I was looking at one file (15 lines) and assumed completeness. The hook was never broken; my measurement was wrong.
date: 2026-05-21
signal: down
category: hooks
tags: 
  - hooks
  - observability
  - daily-log
  - measurement-discipline
actionType: store-mistake
sourceFeedbackId: fb_1779400030067_fecgsj
---

# Diagnosed 'daily log hook missing 80% of turns' but the real cause was per-cwd partitioning. There were 5 daily log files for today (totaling ~111 entries) — I was looking at one file (15 lines) and assumed completeness. The hook was never broken; my measurement was wrong.

## Context

Looked at ONE daily log file in the user's parent cwd, counted 10 entries, declared a 'miss rate' against expected 50+ turns. Didn't enumerate other daily log files across the ~/.claude/projects/* dirs that other Claude Code sessions wrote to.

## Corrective Action

When investigating any per-project/per-session log file, ALWAYS enumerate all candidate files (find ~/.claude/projects -name 'YYYY-MM-DD.md') BEFORE asserting coverage stats. Concretely: add a check to any future 'log coverage' diagnostic that lists ALL files matching the pattern, not just the one in the current cwd. Same principle as the verify-competitor-before-contrasting memory: enumerate the full universe before asserting absence.

## Tags

[[hooks]], [[observability]], [[daily-log]], [[measurement-discipline]]
