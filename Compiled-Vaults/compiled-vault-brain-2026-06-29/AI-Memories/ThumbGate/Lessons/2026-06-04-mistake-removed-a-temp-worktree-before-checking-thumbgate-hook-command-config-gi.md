---
title: "MISTAKE: Removed a temp worktree before checking ThumbGate hook command config; Git tried to execute a missing pre-push hook..."
date: 2026-06-04
category: error
promoted: true
linkedRules: []
linkedGates: []
---

# MISTAKE: Removed a temp worktree before checking ThumbGate hook command config; Git tried to execute a missing pre-push hook...

## Corrective Action

What went wrong: Removed a temp worktree before checking ThumbGate hook command config; Git tried to execute a missing pre-push hook under /private/tmp/tg-open-enterprise-data-chat.
How to avoid: Before removing temp worktrees during PR hygiene, inspect git config --show-origin --get-all hook.thumbgate-pre-push.command hook.thumbgate-pre-commit.command and repoint them to the active checkout if they reference the worktree being deleted.

## Tags

[[feedback]], [[negative]], [[pr-hygiene]], [[worktree-cleanup]], [[thumbgate-hooks]], [[session-directive]]

## Source

Backlink: [[Feedback/fb_1780601939088_n2ehw5]]
