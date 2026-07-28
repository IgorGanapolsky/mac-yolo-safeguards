# Best-in-class ML — July 2026 (Hermes / ThumbGate)

This document is the **honest bar** for July 2026 ML excellence on this repo.
It separates **platform** (tooling + evals + metrics discipline) from
**production model quality** (labels + promoted calibrated model + cash proof).

## One-command gate

```bash
node tools/ml-gate.js           # human report
node tools/ml-gate.js --json    # machine
node tools/ml-gate.js --strict-platform   # exit 1 if platform gaps
```

| Layer | Meaning | How we pass |
|-------|---------|-------------|
| **Platform ready** | July 2026 founder-platform bar | labels, train+CV+Brier+calib, registry, serve, A/B gate, RAG nDCG, agent evals, unit tests |
| **Production ML ready** | Safe to claim trained production ML | real paid labels ≥5 pos / ≥20 rows, trained model, registry promote, Platt calib, Stripe receipt |

## Architecture

```text
Labels ──► Train (logistic + CV + holdout + Brier + Platt)
              │
              ├─► Registry (version + promote)
              │
              └─► Serve (batch/single) ──► pipeline-data-science blend
RAG harness ──► recall@k + nDCG@k
Experiments ──► min-n + two-proportion z (no invented winners)
SYSTEM_SCORES ──► evidence only (tinker-brain + decision-stack)
ml-gate ──► platform vs production honesty
```

## Commands

```bash
# 1) Labels
node tools/ml-label-store.js export

# 2) Train + register
node tools/ml-propensity-train.js train --register --json

# 3) Promote production pointer
node tools/ml-registry.js list --json
node tools/ml-registry.js promote --id <MODEL_ID>

# 4) Serve
node tools/ml-serve.js score --features '{"agent_stack":"yes",...}' --json
node tools/ml-serve.js batch --tsv path/to/prospects.tsv --out /tmp/scored.tsv

# 5) Experiments
node tools/ml-experiment.js create --id campaign-A --hypothesis "…"
node tools/ml-experiment.js record --id campaign-A --arm a --success 1 --n 10
node tools/ml-experiment.js analyze --id campaign-A --min-n 30 --json

# 6) RAG quality
node tools/rag-retrieval-eval.js --json   # meanRecallAtK + meanNdcgAtK

# 7) Scores + gate
node tools/ml-system-scores.js --write
node tools/ml-gate.js
```

## July 2026 checklist (what “best-in-class” means here)

| Capability | Status when platform green |
|------------|----------------------------|
| Fail-closed labels | ✅ |
| Holdout AUC + Brier + logloss + P/R/F1 | ✅ |
| k-fold CV | ✅ |
| Calibration (Platt) | ✅ |
| Feature importance | ✅ |
| Model registry + promote | ✅ |
| Production serve path | ✅ |
| A/B with statistical gate | ✅ |
| RAG recall@k + nDCG@k | ✅ |
| Agent ability evals | ✅ |
| Honest SYSTEM_SCORES | ✅ |
| Paid-label production model | ⏳ until Stripe + pipeline paid rows |
| GPU fine-tunes / LoRA | ⏳ only after residual error is capacity |
| Online multi-arm bandit | ⏳ not required for founder bar |

## Anti-claims (hard rules)

- Never say “best-in-class production model” when `production_ml_ready=false`.
- Never declare A/B winners under min-n or without |z|≥1.96.
- Never invent AUC when `insufficient_labels`.
- External cash only from Stripe receipt `external_net_cents`.

## Proof

```bash
node tests/test-ml-stack.js
node tests/test-ml-best-in-class.js
node tools/ml-gate.js --strict-platform
node tools/system-maturity-scorecard.js --json
```
