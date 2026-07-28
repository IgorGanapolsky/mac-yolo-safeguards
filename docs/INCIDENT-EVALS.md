# Hermes Incident Evals

`tools/incident-eval-runner.js` turns recurring false-green incidents into
versioned, executable verifier tests. It is intentionally smaller than a hosted
observability platform:

- no model or provider call;
- no network access or production writes;
- no hosted macOS requirement;
- no raw fixture values in reports; and
- no successful task without both positive and adversarial cases.

The v1 manifest is `evals/incidents/v1.json`. It covers three production-derived
failure classes:

1. `Not connected` satisfying a broad `Connected` match;
2. skipped or status-less mobile E2E evidence being treated as a pass; and
3. iPad E2E routing onto 10x-billed hosted macOS or an untrusted fork running on
   a self-hosted machine.

## Run the cheap PR tier

```bash
node tools/incident-eval-runner.js --tier pr
```

Every case produces two redacted trajectories:

- the execution trajectory records the isolated environment, observed field
  names, input digest, and duration;
- the verifier trajectory records its decision, expected decision, bounded
  evidence codes, and whether they matched.

The report exits `0` only when every positive and adversarial case behaves as
expected. Invalid manifests exit `2`. `--write` persists a mode-0600 report
under `~/.hermes/receipts/incident-evals/`; default execution is read-only.

## Mutation proof

`tests/test-incident-eval-runner.js` deliberately replaces each verifier with an
`accept everything` mutant. All three mutants must make the suite fail. This
prevents a tautological test from certifying the exact permissive behavior the
eval exists to stop.

The root CI job already executes every `tests/test-*.js` file on Ubuntu, so this
test is automatically enforced without adding another workflow, provider, or
macOS runner.
