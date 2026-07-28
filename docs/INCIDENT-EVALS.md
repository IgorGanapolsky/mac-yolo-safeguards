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
  names, input digest, inspected artifact paths and SHA-256 digests, and
  duration;
- the verifier trajectory records its decision, expected decision, bounded
  evidence codes, and whether they matched.

The accept cases are coupled to production artifacts:

- connection cases execute
  `hermes-mobile/src/utils/connectionStatusContract.ts#resolveCalmConnectionStatus`
  with the Node 22 TypeScript type-stripping runtime used by CI;
- the iPad case inspects `.github/workflows/ipad-simulator-e2e.yml`, including
  its reserved runner and fork-denial gates; and
- the continuous-E2E case hashes the actual JSON artifact bytes, checks them
  against the manifest binding and reported digest, and requires the
  artifact's embedded revision to equal the reported revision.

Artifact reads are repository-contained, reject escaping symlinks and unsafe
paths, and are capped at 1 MiB. Raw artifact bodies and predicate results do
not enter the report.

The report exits `0` only when every positive and adversarial case behaves as
expected. Invalid manifests exit `2`. `--write` persists a mode-0600 report
under `~/.hermes/receipts/incident-evals/`; default execution is read-only.

## Mutation proof

`tests/test-incident-eval-runner.js` deliberately replaces each verifier with
both `accept everything` and `reject everything` mutants. All six mutants must
make the suite fail. This prevents a tautological test from certifying either
permissive false greens or blanket false negatives.

Three additional mutations alter the production boundaries while leaving the
verifiers intact: the real connection predicate is replaced with an
always-connected implementation, the real iPad workflow is changed to
`macos-latest`, and the bound E2E artifact revision is changed without its
trusted digest. Each mutation must turn the suite red.

The root CI job already executes every `tests/test-*.js` file on Ubuntu, so this
test is automatically enforced without adding another workflow, provider, or
macOS runner.
