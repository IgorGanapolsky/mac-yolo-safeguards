---
type: "procedure"
source_status: "source-backed"
last_verified: "2026-06-29T13:49:05.760Z"
---
# Experiment Loop Procedure

1. Write the objective and target metric.
2. Name the implementation path and evaluator command.
3. Add reward-hack checks and variance checks.
4. Name retained context and branch-combine plan.
5. Run `node tools/recursive-experiment-loop.js plan --json --task "<task>"` in the source repo.
6. Promote only experiments with validation evidence.

## Provenance

- SOURCE-MANIFEST.md
