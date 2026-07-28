# ML stack — July 2026

See **[ML-BEST-IN-CLASS-JULY-2026.md](./ML-BEST-IN-CLASS-JULY-2026.md)** for the full bar.

## Quick path

```bash
node tools/ml-label-store.js export
node tools/ml-propensity-train.js train --register
node tools/ml-system-scores.js --write
node tools/ml-gate.js
```

## Components

| Tool | Role |
|------|------|
| `ml-label-store.js` | Labels from pipeline / Stripe / attribution / fixtures |
| `ml-core.js` | Shared metrics: AUC, Brier, CV, Platt, nDCG, A/B z-test |
| `ml-propensity-train.js` | Logistic train + holdout + CV + calibration |
| `ml-registry.js` | Versioned models + production promote |
| `ml-serve.js` | Batch/single inference |
| `ml-experiment.js` | A/B with min-n + significance |
| `ml-system-scores.js` | Evidence SYSTEM_SCORES line |
| `ml-gate.js` | Platform vs production checklist |
| `rag-retrieval-eval.js` | recall@k + nDCG@k |
| `pipeline-data-science.js` | Blends trained model when present |

Artifacts: `~/.hermes/ml/` (labels, model, registry, experiments, system-scores).
