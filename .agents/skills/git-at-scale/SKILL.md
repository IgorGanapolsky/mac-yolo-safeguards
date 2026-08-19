---
name: git-at-scale
description: >
  Client-side Git scale hygiene stolen from Cursor Continuity ("Git at any
  scale"): multi-pack-index, commit-graph, geometric repack, safe agent
  worktree GC, tip-consistency checks. NOT Origin/WAL hosting. Trigger:
  packs high, worktree sprawl, slow git, Cursor Continuity blog, git at any
  scale. Slash: /git-at-scale.
---

# Git at scale (client steal)

Cursor Continuity/Origin is **server hosting**. We stay on GitHub. Steal only:

1. Packfile proliferation → `multi-pack-index` + `commit-graph` (+ optional geometric repack)
2. Agent throwaway worktrees → cattle under `/tmp/agent-git-worktrees` (clean prune only)
3. Consistent tip for CI → `--tip-consistency` vs `origin/<branch>`

```bash
node tools/git-at-scale-engine.js --scorecard
node tools/git-at-scale-engine.js --maintenance          # cheap indexes
node tools/git-at-scale-engine.js --maintenance --geometric
node tools/git-at-scale-engine.js --prune-worktrees --base /tmp/agent-git-worktrees --dry-run
node tools/git-at-scale-engine.js --tip-consistency --branch main
npm test --silent -- tests/test-git-at-scale-engine.js  # or: node tests/test-git-at-scale-engine.js
```

## Never

- Rebuild S3 WAL / Origin
- Force-prune dirty or open-PR worktrees outside the agent base
- Treat `mss=UNKNOWN` / eventual tip as fine for CI truth
