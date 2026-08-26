# Agentic Pattern Receipts

## Why this exists

Antonio Gulli’s *Agentic Design Patterns* catalog is useful as a vocabulary, but a catalog alone does not decide which patterns a production task actually needs. The repository covers 21 patterns spanning routing, reflection, tools, planning, multi-agent work, memory, recovery, human review, retrieval, resource control, guardrails, evaluation, prioritization, and exploration.[1] Tom Dörr’s post points readers to that guide and its executable notebooks.[2]

Our high-ROI transfer is a deterministic selection contract, not another agent framework:

1. Describe a task with typed risk, effects, uncertainty, independence, state, retrieval, resources, confirmation, and success metrics.
2. Select only patterns whose preconditions are explicitly satisfied.
3. Reject every other pattern with a reason.
4. Emit mandatory evidence gates and a stable SHA-256 receipt.
5. Feed the receipt into `tools/agent-decision-stack.js` when making a non-trivial architecture decision.

## Fail-closed boundaries

- Unknown fields plus credential-shaped field names or string values are rejected without echoing attacker-controlled content.
- Input must be valid UTF-8; decoding is fatal rather than replacement-based.
- Valid JSON hashes its canonical parsed value, so whitespace and key order do not change the receipt. Malformed encoding/JSON hashes the original bytes.
- Consequential external writes and high-risk internal writes cannot opt out of human confirmation.
- Parallelization is not justified by workload size alone; workstreams must be independent and use disjoint resources.
- Multi-agent execution additionally requires distinct specialist roles and an ownership map.
- Retrieval requires source provenance and unsupported-claim checks.
- A simple deterministic task receives no planning, multi-agent, reflection, or routing overhead unless its manifest justifies them.

## Commands

```bash
node tools/agentic-pattern-selector.js \
  --manifest .agents/skills/agentic-pattern-selector/assets/read-research.example.json

node tools/agent-decision-stack.js \
  --task "Research current evidence to a verified decision" \
  --governance infra \
  --pattern-manifest .agents/skills/agentic-pattern-selector/assets/read-research.example.json \
  --json
```

The selector receipt is architecture evidence only. Its returned gates still need real test, policy, confirmation, readback, and rollback receipts.

## Sources

[1] https://github.com/evoiz/Agentic-Design-Patterns — Agentic Design Patterns
[2] https://x.com/i/status/2092370736744665163 — Tom Dörr post
