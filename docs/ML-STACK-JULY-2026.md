# ML stack — July 2026 baseline (fail-closed)

Honest scope: this is a **founder-scale ML path**, not “best-in-class” trained platform ML.
It implements the five upgrades that close the gap between **decision engineering** and
**measurable learning**, without inventing AUC or cash.

## Pipeline

```text
1. Labels     node tools/ml-label-store.js export
2. Train      node tools/ml-propensity-train.js train
3. Scores     node tools/ml-system-scores.js --write
4. RAG eval   node tools/rag-retrieval-eval.js --json
5. Maturity   node tools/system-maturity-scorecard.js --json
```

| Step | Tool | Fail-closed rule |
|------|------|------------------|
| Labels | `ml-label-store.js` | Missing pipeline/Stripe → empty rows, never invent paid |
| Train | `ml-propensity-train.js` | Need ≥5 paid positives and ≥20 rows; else `insufficient_labels` |
| Scores | `ml-system-scores.js` | Reads only files + RAG eval; writes `SYSTEM_SCORES=` line |
| RAG | `rag-retrieval-eval.js` | Fixture recall@k on `hermes-retrieval-harness` |
| Ability | `agent-swarm-harness` eval-* | Offline `verifyCommand` where possible |

Artifacts land in `~/.hermes/ml/` (gitignored home dir):

- `labels.jsonl` / `labels-summary.json`
- `propensity-model.json` (`trained` or `insufficient_labels`)
- `system-scores.json`

## What is *not* claimed

- No sklearn/torch dependency (pure-JS logistic regression).
- No LoRA / fine-tune until residual error is model capacity (after labels exist).
- External cash only from Stripe receipt `external_net_cents`.
- Synthetic fixture `tests/fixtures/ml/synthetic-labels.jsonl` is for **unit tests**, not production truth.

## Wire-up

- **tinker-brain export** stamps `SYSTEM_SCORES=` from `ml-system-scores.js`.
- **agent-decision-stack** attaches `telemetry.mlSystemScores` on every brief.
- **system-maturity-scorecard** has an `ml_stack` pillar (train on fixture + empty fail-closed).
- **eval ability** `ml_labels_fail_closed` encodes the no-fake-AUC bar.

## Promotion criteria (when ML stops being “F”)

1. Non-owner Stripe payments produce labels (`reconcile_stripe_revenue_receipt` + pipeline stages).
2. `train_ready=true` on labels-summary (≥5 pos, ≥20 rows).
3. Holdout AUC reported and stable across two weeks.
4. Only then consider adapters / paid training.
