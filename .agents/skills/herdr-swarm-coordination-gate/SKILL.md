---
name: herdr-swarm-coordination-gate
description: "Grade a Herdr swarm across Linear, the vault, GitButler or a worktree, a Gemini notebook, GitHub, a separate judge, and at least two experts. Award an A+ only when every plane has proof."
---

# Herdr swarm coordination review

Use this when a prompt is shared by several agents and the swarm needs one writer, a separate judge, and a recorded expert choice.

The contract is `docs/HERDR-SWARM-COORDINATION-SOW.md`. The grade is the lowest plane. Installed tools do not score a plane. The status command does not award a grade and does not call a model.

```bash
node tools/herdr-swarm-coordination-gate.js
node tests/test-herdr-swarm-coordination-gate.js
```
