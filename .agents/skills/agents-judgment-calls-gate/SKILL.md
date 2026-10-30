---
name: agents-judgment-calls-gate
description: "Review a judgment call before it counts. Require both options, the caller's own prior, and local evidence when the choice follows an agent lean. Anthropic's study rates stay theirs."
---

# Judgment-call review

Use this before a merge, a send, a spend, a delete, a ship, or a recommendation is treated as decided.

Anthropic's write-up is the source: https://www.anthropic.com/research/agents-judgment-calls

Experts in that study signed work whose open choices had followed an agent's lean, and many of them later repeated the agent's wording. Their rates stay theirs. This gate does not call a model and does not store a deferral rate.

## What this gate does

- A judgment names two different options and a case for each.
- The caller records their own prior: A, B, or none.
- The caller records the agent lean: A, B, or none.
- A choice that follows the lean needs local evidence, and that evidence has to be something other than the agent's paragraph.
- Switching off a stated prior onto the lean needs a credit.
- A reason that repeats the agent's wording needs a credit.
- A second check that names the same model as the first is blocked.
- A routine typo is left alone.

## Commands

```bash
node tools/agents-judgment-calls-gate.js
node tools/agents-judgment-calls-gate.js --review --task "recommend whether to roll out the subsidy" --option-a "roll out" --option-b "discontinue" --choice A --prior A --lean B --case-a "local table clears the margin" --case-b "cost per yield stays under it" --reason "I keep roll out" --evidence "read coop-table.csv"
node tests/test-agents-judgment-calls-gate.js
```

The status command does not call a model.
