---
name: context-six-block
description: >
  Everyday AI Ep 710 FORMAT steal: six context blocks (goal, constraints, reference,
  examples, procedures, rubric) across personal/team/company/market layers. Show-don't-tell
  few-shot gold and rubric-first grading. Not Everyday AI, not ChatGPT connectors.
  Complementary to context-vault (Allie 8 prompts). Slash: /context-six-block.
---
# Context six-block pack

Use before drafting agent/public copy when the user cites Everyday AI, six key blocks,
show don't tell, rubric-first, or reusable context vaults.

## Steal (FORMAT only)

| Block | Meaning here |
|-------|----------------|
| Goal | What to produce and for whom |
| Constraints | Chief lock, no Continuity hero, no invented traction |
| Reference | AGENTS.md, CHIEF.md, SKILLS.md |
| Examples | Concrete gold + bad (not "write well") |
| Procedures | Load pack → example → rubric → capped repair |
| Rubric | mustInclude / mustNot, graded before ship |

Layers: personal (this agent/worktree), team (AGENTS.md), company (Chief), market ($10 fenced VPS).

## Do not

- Clone Everyday AI / Prime Prompt Polish
- Add ChatGPT/Claude/Gemini connector SKUs
- Dual-edit `tools/context-vault.js`
- Claim LIVE from this pack (`liveClaim` is always false)

## Proof

```
node tests/test-context-six-block.js
node tools/context-six-block.js --json
node tools/context-six-block.js --grade "Hosted Hermes is $10/mo chat on a fenced VPS."
```

Business-data "connectors" map to `coding-context-pack`, recall, and SKILLS.md.
