# PR hygiene session 2026-08-18 (grok)

## Merged
- #1736 → `8d66b8f8be3a7a5f60630a651107203bad5adab7` at 2026-08-18T03:22:00Z
  https://github.com/IgorGanapolsky/mac-yolo-safeguards/pull/1736

## Unblocked (stale DIRTY → MERGEABLE) + auto-merge armed
Worktree `git merge --no-ff origin/main` then push:
#1746 #1745 #1742 #1750 #1749 #1744 #1743 #1725

## Closed superseded drafts
#1765 #1783 #1689 #1767 #1748

## Cleanup
- Remote heads deleted: 6 (incl. `grok/pr-hygiene-directives-20260818` + closed draft branches)
- Worktrees: 20 → 19 (removed `.worktrees/pr-hygiene-directives-20260818`)
- Remote branches: 191 → 186
- Open PRs: 64 → 60

## Lesson (do not edit shipping-and-hygiene.md while claimed)
GitHub `DIRTY` / `gh pr update-branch` conflicts can be stale.
Prove with `git merge-tree --write-tree origin/main <head>`.
If clean: in isolated worktree `git merge --no-ff origin/main` (needed when `pull.ff=only`), push, `gh pr merge --squash --auto`.
Real conflicts (verify.sh, seed-yolo-wrapper.js, hermes-mobile-pair.js): leave for owning agent — never bulk-close.

## Remaining (accounted, not mergeable yet)
- ~15 CONFLICTING with real file conflicts
- ~28 MERGEABLE BLOCKED/BEHIND waiting required CI (auto-merge armed)
- ThumbGate #3509/#3491 auto-armed; #3514/#3502 still red
- hermes-mobile 4 CONFLICTING + 1 draft
- CodeQL `open_on_main=0` but local `pattern_gate=FAIL` (5 findings) — do not claim security clean
- Tip CI after #1736 still settling (Merge-Ready Bot queue noise); required matrix not fully green in rollup yet

## RAG
Promoted memory `mem_1787023740022_o00zpa` / feedback `fb_1787023740019_dl6hbq`
