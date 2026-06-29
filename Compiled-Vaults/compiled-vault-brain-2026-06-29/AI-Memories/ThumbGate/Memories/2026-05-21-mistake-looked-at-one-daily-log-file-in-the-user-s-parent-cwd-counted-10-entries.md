---
title: "MISTAKE: Looked at ONE daily log file in the user's parent cwd, counted 10 entries, declared a 'miss rate' against expected 50+..."
date: 2026-05-21
category: error
tags: 
  - feedback
  - negative
  - hooks
  - observability
  - daily-log
  - measurement-discipline
signal: down
---

# MISTAKE: Looked at ONE daily log file in the user's parent cwd, counted 10 entries, declared a 'miss rate' against expected 50+...

What went wrong: Looked at ONE daily log file in the user's parent cwd, counted 10 entries, declared a 'miss rate' against expected 50+ turns. Didn't enumerate other daily log files across the ~/.claude/projects/* dirs that other Claude Code sessions wrote to.
How to avoid: When investigating any per-project/per-session log file, ALWAYS enumerate all candidate files (find ~/.claude/projects -name 'YYYY-MM-DD.md') BEFORE asserting coverage stats. Concretely: add a check to any future 'log coverage' diagnostic that lists ALL files matching the pattern, not just the one in the current cwd. Same principle as the verify-competitor-before-contrasting memory: enumerate the full universe before asserting absence.

## Tags

[[feedback]], [[negative]], [[hooks]], [[observability]], [[daily-log]], [[measurement-discipline]]

## Source

Backlink: [[Feedback/fb_1779400030067_fecgsj]]
