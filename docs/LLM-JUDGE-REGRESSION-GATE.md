# LLM-as-Judge regression gate

`tools/llm-judge-gate.js` measures semantic answer quality without allowing an
unavailable, biased, malformed, or compromised judge to create a green result.
It complements deterministic tests; it does not replace them.

## Decision loop

| Stage | Why it exists | What can go wrong | How it is measured |
|---|---|---|---|
| Versioned dataset | Makes the evaluation population reviewable and reproducible | Tiny or stale fixtures, missing evidence, model-generated labels, secret-bearing examples | Schema validation, minimum case count, baseline/candidate label diversity, risk-slice counts, dataset SHA-256 |
| Reference label | Lets policy fixtures test mechanics while keeping real calibration separate | Policy examples get misrepresented as user votes | Explicit `policy_fixture` versus `human` type, source reference, annotation ID/date/rationale codes |
| Human preference | Defines the outcome a production judge must reproduce | Circular self-grading, undocumented relabeling, ambiguous ties | Minimum real-human count, human-only agreement and confusion matrix; policy fixtures cannot make the gate pass |
| Deterministic precheck | Keeps facts that code can prove out of an opinionated model | A judge excuses missing proof, secrets, or a forbidden claim | Required-evidence and text contracts; hard reject before any model call |
| Pairwise judge | Compares a candidate against a known baseline with a fixed rubric | Absolute scoring inflation, verbosity bias, prompt injection, malformed output | Strict JSON schema, criterion results, supplied evidence IDs, unsupported-claim codes |
| Position swap | Detects preference for answer A or answer B | Order bias looks like semantic quality | Run A/B and B/A; disagreement becomes an abstention; position consistency has a threshold |
| Calibration | Converts model votes into an auditable regression decision | Aggregate accuracy hides unsafe misses or rejection of improvements | Agreement, regression precision/recall, FPR, FNR, abstention rate, critical false negatives, and the same metrics per risk slice |
| Fail-closed state | Separates “bad candidate” from “evaluation did not run” | Timeouts or parser failures silently count as passes | Exit `0=pass`, `1=measured fail`, `2=not evaluated`; any provider failure produces `not_evaluated` |
| Receipt | Lets CI and reviewers verify what ran without retaining prompts | Raw prompts, credentials, or answers leak into logs; a stale result is reused | Mode `0600`, directory `0700`, immutable timestamped record, latest snapshot, dataset/rubric/prompt/input hashes, aggregate metrics |
| Mutation controls | Proves the test can become red | Tests only exercise the happy path or assert constants | Accept-all, reject-all, A-position, malformed JSON, timeout, missing evidence, prompt injection, unknown evidence, secret, and incomplete-provenance mutations |
| DPO export | Turns real thumbs into optimization data | A fallback invents “human” preferences and trains the model on fiction | Human-verification requirement, annotation provenance, dedupe hash, secret rejection, `insufficient_data` when zero real pairs exist |

## What is gated

The v1 policy lives beside the fixtures in `evals/llm-judge/v1.json`:

- at least 8 labeled cases;
- at least 4 genuinely human-labeled cases before any judge request is sent;
- at least 0.75 exact agreement with human preferences;
- at least 0.90 A/B versus B/A position consistency;
- no more than 0.25 false-negative rate for real regressions;
- no more than 0.34 false-positive rate against improvements or ties;
- no more than 0.12 abstentions;
- zero critical regressions accepted.

The committed v1 seed has eight `policy_fixture` labels derived from repository
directives and zero ThumbGate-vote labels. That is intentional: it validates
the runner and mutation controls but cannot claim human calibration. Running
`evaluate` against it exits 2 with `insufficient_human_cases:0<4` before
spending a model call. A production dataset must preserve actual ThumbGate
annotation provenance and set `label.type` to `human`; relabeling policy
fixtures as human is data fabrication.

A “regression” means the human preferred the baseline. Precision answers “when
the gate rejected a candidate, how often was that correct?” Recall answers “of
the human-identified regressions, how many did the gate catch?” FPR measures
good or tied candidates incorrectly rejected. FNR measures bad candidates
allowed or left undecided. A critical abstention counts as a false negative.

These thresholds are deliberately conservative for an eight-case seed set. The
seed is large enough to prove mechanics, not product-wide generalization or
human agreement. Add a human case for each real miss, retain old cases as a
regression suite, review label changes, and raise thresholds only after the
confidence interval narrows.

## Commands and CI

The root CI job already discovers every `tests/test-*.js` file, so
`tests/test-llm-judge-gate.js` is executed without editing the concurrently
owned workflow.

Validate the data without a model:

```bash
node tools/llm-judge-gate.js validate \
  --dataset evals/llm-judge/v1.json \
  --json
```

Replay the committed policy fixtures (expected exit 2 until human labels are
present; still writes a receipt):

```bash
node tools/llm-judge-gate.js replay \
  --dataset evals/llm-judge/v1.json \
  --judgments /path/to/judgments.json \
  --receipt-dir /private/path/to/receipts \
  --json
```

Exercise an OpenAI-compatible local provider with a genuinely human-labeled
dataset:

```bash
node tools/llm-judge-gate.js evaluate \
  --dataset /private/path/to/human-labeled-dataset.json \
  --base-url http://127.0.0.1:11434/v1 \
  --model MODEL_NAME \
  --receipt-dir /private/path/to/receipts \
  --json
```

The provider adapter uses temperature 0, a fixed seed, JSON-object response
calls after the order swap). `--max-cases` may lower that ceiling. Each request
also has a 768-token completion ceiling; `--max-tokens` can set 64–4096. The
wall-clock and token budgets cover different failures: a model can generate
valid tokens forever without a token cap, while a stalled provider can consume
no tokens and still require a timeout. The receipt records token counts and p95
call latency when the provider reports them. It never puts an API key in a
receipt. A local model is cheaper and keeps evaluation content on-device, but
may follow embedded instructions or be less calibrated. A
stronger hosted judge may improve agreement at the cost of privacy, latency,
provider drift, and money. The gate allows either only after the same mutation
and human-calibration checks.

Receipts distinguish attempted calls from completed calls. A timeout therefore
cannot appear as “the judge was never invoked,” and token/latency totals never
pretend an incomplete response was billable usage reported by the provider.

## Tradeoffs

Pairwise comparison is more stable than asking for an absolute 1–10 score, but
it doubles calls. Swapping order doubles them again. The extra cost is justified
for a merge gate because it directly measures position bias; for exploratory
offline analysis, a single order may be cheaper but is not merge evidence.

A strict schema increases `not_evaluated` failures with weaker local models.
Permissive JSON repair would make more runs complete, but it would also hide
provider drift. The merge gate therefore rejects prose and fenced JSON.

Human labels are expensive and sometimes disagree. The dataset records ties
instead of forcing false certainty, while critical cases require zero missed
regressions. Multiple annotators and adjudication are the next step when the
fixture count grows; the current schema intentionally avoids pretending one
label supplies an uncertainty estimate.

Per-slice metrics reveal a safety or revenue failure hidden by a strong overall
average, but tiny slices are descriptive rather than statistically decisive.
Do not call a slice “solved” from one example. The overall gate protects the
seed corpus; production canaries and real thumbs remain separate proof.

## Known boundary

`tools/eval-benchmark-suite.js` is being corrected in independently owned PR
#1136. This change does not edit or merge across that ownership boundary. Until
that PR is resolved, its headline score is not evidence for this gate. The
authoritative proof for this surface is the versioned dataset, this runner, its
mutation suite, and a receipt from the exact evaluated revision. None of those
alone establishes production judge quality without the required human cases.
