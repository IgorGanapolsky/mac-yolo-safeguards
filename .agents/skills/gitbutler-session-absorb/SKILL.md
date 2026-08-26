---
name: gitbutler-session-absorb
description: >
  GitButler session-branch isolation plus absorb/undo. One agent/<slug>
  branch per session; absorb unpublished own hunks; never another agent's
  applied branch. Linked worktrees stay on git. Slash: /gitbutler-session-absorb.
---

# GitButler session branch + absorb

Only after `assert_but_setup_safe.sh` exit 0 (isolated clone, `but setup` already done).
On mac-yolo / ThumbGate **linked worktrees**, official `but` already says use **git**.

```bash
but diff
but commit -b agent/<session-slug> -m "msg" <id> <id>
but absorb <hunk-id>          # unpublished own commit only
but undo                      # last operation
```

## MUST

- One virtual branch per session. Leftover hunks stay dirty — do not sweep.
- Absorb only unpublished local commits on **your** branch.
- Ship mandate: if the task already authorizes a PR, `but push` / `but pr new`.

## NEVER

- `but move` / `amend` / `squash` / `absorb` another agent's applied branch
- Absorb into pushed or reviewed history
- `but setup` from a linked worktree
- Dual-edit Codex #2119 `tools/gitbutler-route.js`

## Related

- [[gitbutler-fleet-automations]]
- Official `~/.grok/skills/gitbutler/SKILL.md`
