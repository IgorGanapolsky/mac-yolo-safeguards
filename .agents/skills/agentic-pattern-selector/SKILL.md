---
name: agentic-pattern-selector
description: Select the minimum justified agentic patterns for a typed task and emit a deterministic evidence receipt.
---

# Agentic Pattern Selector

Use this before designing or expanding a non-trivial agent workflow. It prevents pattern cargo-culting: every one of the 21 source patterns is either selected with a reason or rejected with a reason.

## Workflow

1. Start from `assets/read-research.example.json` or `assets/external-write.example.json`.
2. Describe effects and risk explicitly. Never infer an external write from prose alone.
3. Run the selector:

```bash
node tools/agentic-pattern-selector.js --manifest path/to/task.json
```

4. Treat `status=block` as a hard stop. Fix the manifest; do not bypass it.
5. Use `selected` as the smallest justified architecture and `gates` as required evidence.
6. For a full system decision brief, wire the same receipt into the existing decision stack:

```bash
node tools/agent-decision-stack.js \
  --task "<measurable decision>" \
  --governance infra \
  --pattern-manifest path/to/task.json \
  --json
```

## Hard rules

- `external_write`, and `internal_write` with `risk=high`, require `humanConfirmation=required`.
- Parallelization requires at least two independent workstreams and disjoint resources.
- Multi-agent requires parallel eligibility plus at least two explicit specialist roles.
- Retrieval work requires source provenance and unsupported-claim checks.
- Simple deterministic work should normally select only evaluation/monitoring.
- Credential-shaped field names or string values are rejected without echoing attacker-controlled content.
- Input must be valid UTF-8; decoding is fatal rather than replacement-based.
- Valid JSON hashes its canonical parsed value, so whitespace and key order do not change the receipt. Malformed encoding/JSON hashes the original bytes.
- A receipt explains architecture; it does not prove execution. Execute every returned gate and retain its evidence separately.

## Verification

```bash
node --test tests/test-agentic-pattern-selector.js
node tests/test-agent-decision-stack.js
bash .agents/skills/agentic-pattern-selector/test.sh
```

## Sources

- https://github.com/evoiz/Agentic-Design-Patterns
- https://x.com/i/status/2092370736744665163
