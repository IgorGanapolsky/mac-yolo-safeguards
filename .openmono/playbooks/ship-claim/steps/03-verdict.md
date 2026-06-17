# Step 3 — Verdict (evidence only)

Claim: **{{parameters.claim}}**

Proof summary:
{{state.proof_output}}

Protected components:
{{state.protected_status}}

## Output format (strict)

```
VERDICT: PASS | FAIL | INCONCLUSIVE
CLAIM: <one line>
EVIDENCE:
  - <bullet with command + observed result>
FALSIFIED_BY: <empty if PASS, else what contradicted the claim>
NEXT_ACTION: <one concrete command or human step if FAIL/INCONCLUSIVE>
```

Rules:

- **PASS** only if every material part of the claim is supported by proof output above.
- **FAIL** if any script exited non-zero or output contradicts the claim.
- **INCONCLUSIVE** if proof was not run or scope was wrong — never guess PASS.
- Do not use the words Done, Shipped, or All clean in this step.

Human review gate: the operator must approve this verdict before capture-lesson runs.
