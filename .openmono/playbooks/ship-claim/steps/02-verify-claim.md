# Step 2 — Run scoped proof

Claim under test: **{{parameters.claim}}**

Scope: **{{parameters.scope}}**

Falsification criteria from prior step:
{{state.falsification_criteria}}

## Shell output (machine truth)

The script `scripts/run-scope-verify.sh` ran for this scope. Its stdout is embedded below.
Treat exit code 0 as necessary but not sufficient — read the output.

{{shell:scripts/run-scope-verify.sh}}

## Your task

1. Map each line of evidence to the claim (supports / contradicts / silent).
2. For CI claims: require a `gh run view` success or explicit passing test summary in output.
3. For "fixed" claims: require reproduce-then-pass, not "should work".
4. For file deletion claims: require before/after counts or file lists.
5. If scope is `docs-only`, skip hermes-mobile npm tests unless the claim touches app code.

Store a structured summary in your response (will become `proof_output`).
