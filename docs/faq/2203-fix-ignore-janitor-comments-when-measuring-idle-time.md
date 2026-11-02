# fix: ignore janitor comments when measuring idle time

<!-- source: Merged PR | id: 2203 | closed: 2026-10-29T14:02:17.964Z -->

## Question

fix: ignore janitor comments when measuring idle time

## Answer

Summary by CodeRabbit

- **Bug Fixes**
  - Automated cleanup now measures inactivity using human comments, reviews, and commits rather than updates from the cleanup process itself.
  - Drafts are closed only after 14 days of human inactivity, and issues only after 30 days. Items with exempt labels are left open, and issues whose titles begin with “security” are not automatically closed.

<!-- end of auto-generated comment: release notes by coderabbit.ai -->

[View source](https://github.com/IgorGanapolsky/mac-yolo-safeguards/pull/2203)

---
