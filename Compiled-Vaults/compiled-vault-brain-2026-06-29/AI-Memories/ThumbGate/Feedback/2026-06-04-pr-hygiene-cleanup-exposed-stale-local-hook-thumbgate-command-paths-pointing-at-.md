---
title: PR hygiene cleanup exposed stale local hook.thumbgate command paths pointing at a removed temp worktree; remote branch deletion failed until hook commands were repointed to the active repo .githooks.
date: 2026-06-04
signal: down
category: pr-hygiene
tags: 
  - pr-hygiene
  - worktree-cleanup
  - thumbgate-hooks
  - session-directive
actionType: store-mistake
sourceFeedbackId: fb_1780601939088_n2ehw5
---

# PR hygiene cleanup exposed stale local hook.thumbgate command paths pointing at a removed temp worktree; remote branch deletion failed until hook commands were repointed to the active repo .githooks.

## Context

Removed a temp worktree before checking ThumbGate hook command config; Git tried to execute a missing pre-push hook under /private/tmp/tg-open-enterprise-data-chat.

## Corrective Action

Before removing temp worktrees during PR hygiene, inspect git config --show-origin --get-all hook.thumbgate-pre-push.command hook.thumbgate-pre-commit.command and repoint them to the active checkout if they reference the worktree being deleted.

## Tags

[[pr-hygiene]], [[worktree-cleanup]], [[thumbgate-hooks]], [[session-directive]]
