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

## Goal

Produce a reusable six-block context pack for whom: Grok/Claude/Codex agents drafting
skills, briefs, or hosted copy — not a one-off prompt paste.

Layers: personal (this agent/worktree), team (AGENTS.md), company (Chief), market ($10 fenced VPS).

## Constraints

NEVER clone Everyday AI / Prime Prompt Polish. NEVER add ChatGPT/Claude/Gemini connector SKUs.
ALWAYS steal FORMAT only (six named blocks + gold + rubric-first). HARD fail closed on heading-only
"show, don't tell". REFUSE to dual-edit `tools/context-six-block.js` or Codex #2126 `tools/context-vault.js`.

## Reference

- Episode FORMAT source: https://www.youreverydayai.com/ep-710-context-engineering-how-to-get-expert-level-outputs-from-ai-chatbots/
- Assembler: `tools/context-six-block.js` (PR #2114)
- Auditor: `tools/audit-six-block.js` (this PR)
- Fleet audit rail: `~/.grok/skills/context-vault-six-blocks/SKILL.md`
- [[coding-context-pack]] · AGENTS.md · CHIEF.md · SKILLS.md

## Examples (show, don't tell)

Weak: Write well.

Gold:

```bash
$ node tools/context-six-block.js --grade "Hosted Hermes is $10/mo chat on a fenced VPS."
$ node tools/audit-six-block.js --doctor --json
```

A heading that says "show, don't tell" with no Weak/Gold pair is a FAIL.

## Procedures

1. Assemble a pack: `node tools/context-six-block.js --json`
2. Grade hosted copy before ship
3. Audit the skill file itself

```bash
node tests/test-context-six-block.js
node tests/test-audit-six-block.js
node tools/audit-six-block.js --doctor --json
```

## Rubric

- assembler gold hosted copy → grade ok
- Continuity-hero copy → grade fail
- this SKILL.md `audit-six-block` → ok=true
- heading-only examples → ok=false
- clonedEverydayAi true → ok=false
- doctor_exit=0
- evidence: test-audit-six-block PASS; dualEditContextSixBlockJs2114=false

Business-data "connectors" map to `coding-context-pack`, recall, and SKILLS.md.
