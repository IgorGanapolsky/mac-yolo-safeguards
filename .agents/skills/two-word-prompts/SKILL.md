---
name: two-word-prompts
description: >
  Allie K. Miller's 18 two-word AI prompts — role-shifting continuation
  commands that steer conversations, challenge assumptions, and uncover new
  use cases after context is already established. Each prompt maps to a
  repo tool that implements the role's purpose within mac-yolo-safeguards.
lifecycle: active
tags:
  - context-engineering
  - agent-onboarding
  - skill-catalog
  - prompting
version: 1.0.0
health_check: node tools/two-word-prompts.js --json
source: https://x.com/alliekmiller/status/2087558225029689618
---

# Two-Word AI Prompts

## Use This When

An AI agent or human needs to quickly shift the role of the conversation
after context has already been established. These 18 short prompts replace
long, complex instructions with a single role-shifting command.

## Triggers

- Any two-word prompt from Allie K. Miller's viral list (e.g. "now what",
  "plz fix", "interview me", "show receipts", "challenge me")
- Role-shifting after task completion, debugging, or context handoff
- `node tools/two-word-prompts.js list` — view all 18 prompts with roles
- `node tools/two-word-prompts.js resolve <prompt>` — resolve a single prompt

## The 18 Prompts

| # | Prompt | Role | Repo Tool |
|---|--------|------|-----------|
| 1 | `now what` | next-actions advisor | `node tools/agent-decision-stack.js` |
| 2 | `plz fix` | debugger | `node tools/codeql-pattern-gate.js --diff HEAD` |
| 3 | `do this` | implementer | `node tools/skill-card-validate.js --list` |
| 4 | `interview me` | context gatherer | `node tools/context-vault.js generate` |
| 5 | `keep going!` | completion driver | `node tools/agent-spin-detector.js` |
| 6 | `elii elie` | simplifier | `node tools/context-vault.js list` |
| 7 | `first principles?` | assumption-resetter | `node tools/agent-decision-stack.js` |
| 8 | `simulate it` | scenario planner | `node tools/codeql-agent-hygiene.js --pre-ship --skip-network` |
| 9 | `challenge me` | critical sparring partner | `node tools/codeql-agent-hygiene.js --pre-ship` |
| 10 | `da fuq?` | simplifier / complexity-reset | `node tools/context-vault.js list` |
| 11 | `find leverage` | efficiency optimizer | `node tools/hermes-economic-router.js` |
| 12 | `hey simon` | chief of staff / orchestrator | `node tools/agent-swarm-harness.js` |
| 13 | `spawn agents` | parallelization driver | `bash bin/agent-loop --health` |
| 14 | `automate this` | codifier | `node tools/skill-card-validate.js --dir .agents/skills` |
| 15 | `remember this` | memory logger | `node tools/agent-knowledge-handoff.js` |
| 16 | `forecast impact` | risk / downstream analyst | `node tools/codeql-agent-hygiene.js --pre-ship --skip-network --impact-analysis` |
| 17 | `show receipts` | evidence verifier | `node tools/skill-card-validate.js --json` |
| 18 | `girl bye` | context-abandoner / reset | `node tools/context-vault.js validate` |

## Verification

```
node tests/test-two-word-prompts.js     # 126 assertions, all pass
node tools/two-word-prompts.js --json   # ok=true, promptCount=18, expected=18
node tools/two-word-prompts.js list     # lists all 18 prompts
node tools/codeql-pattern-gate.js --json tools/two-word-prompts.js  # ok=true, 0 findings
```

## Relationship to Other Skills

- **context-vault** — provides the foundational 8 identity/context prompts that
  establish baseline understanding before two-word prompts are applied.
- **skill-card-validate** — used by `do this`, `automate this`, and `show receipts`
  to ensure skill manifests remain valid and catalog-complete.
- **agent-decision-stack** — invoked by `now what` and `first principles?` to
  evaluate intent alignment with repo truth before cloud execution.
