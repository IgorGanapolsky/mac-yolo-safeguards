# Action-reliability classifier — findings, 2026-07-28

**Task.** Given an agent action, predict whether it will be thumbed down. That is
ThumbGate's product thesis, so it is the only model worth building from this corpus.

**Verdict: no shippable model exists yet, and the corpus is the reason — not the
modelling.** The gate correctly refuses (exit 1). What follows is what we measured and
exactly what has to change for a model to become possible.

## The corpus is far smaller than it looks

The raw feedback surface looks like **5,588 labelled signals across 19 files**. It is
not 5,588 independent events:

| finding | measurement |
|---|---|
| `lessons-index.feedbackId` → `feedback-log.id` | **716 of 716** links, **all** carrying the identical label — duplicates |
| `attributed-feedback.attribution_id` ∩ `feedback-attributions` | **383 of 383** overlap — duplicates |
| `attributed-feedback.jsonl` | **946/946 negative** — single-class; alone it trains a model that predicts "bad" always at 100% "accuracy" |

Concatenating those files puts the **same event in train and test**. We therefore use
`feedback-log.jsonl` as the single event source, which removes cross-file duplication
by construction rather than by a dedupe pass we would have to trust.

## Three leaks, each of which produced a "brilliant" and worthless model

Every one of these was caught by refusing to accept a high score at face value.

**1. Post-hoc fields.** `whatWentWrong` appears in **80% of negatives and 0% of
positives**; `whatWorked` in **53% of positives and 0% of negatives**. Both are written
*after* the outcome. Excluded.

**2. `actionType` is the label in another column.**

| actionType | n | negative | positive | purity |
|---|---|---|---|---|
| `store-mistake` | 393 | 393 | 0 | **100%** |
| `store-learning` | 518 | 0 | 518 | **100%** |
| `no-action` | 881 | 657 | 224 | 75% |

With it included the model scored **AUC 0.9999**. Dropping the *field* is insufficient —
those 911 rows exist *because of* their outcome, and their other fields are written by
the same outcome-aware code path. The whole population is excluded.

**3. `context` is the verdict verbatim.** Every value is literally `"thumbs down"` or
`"thumbs up"`. The token `down` occurs in 655 rows, **100% negative**. Scored
**AUC 1.0000**. Excluded.

> Treat AUC ≥ 0.99 on a real-world reliability task as "find the leak", never as success.

## What is left, and why it cannot support a model

After exclusions: **616 train / 265 test**, split temporally at 2026-07-17.

- **3 distinct tags exist.** Two (`claude-history-sync`, `auto-capture-fallback`) appear
  on **all 864 rows identically** — constant, zero discriminative power.
- **`actionReason` is present on all 881 rows** — constant, zero signal.
- The only discriminative tag covers **17 rows**.

Result: **AUC 0.5476, ECE 0.1917 — exactly equal to the `tag_prior` baseline (0.5476).**
The learned model adds *literally nothing* over a one-line historical tag rate, and its
probabilities are badly miscalibrated. The gate fails all three conditions.

That equality only became visible after review: the original fourth baseline keyed on
`actionType`, which the builder excludes as leakage, so every lookup missed and the
"non-trivial heuristic" silently collapsed into the train-prior constant. The gate was
comparing the model against three constants and a coin flip while claiming otherwise.
Fixing the baseline to use `tags` — a field the builder actually emits — turned "barely
above chance" into the sharper and more useful "identical to a trivial heuristic".

This is the honest outcome: *you cannot predict what was never recorded.* The corpus
captures outcomes richly and pre-action state almost not at all.

## The gate

Ships only if **all three** hold — a point estimate alone is not evidence:

1. AUC ≥ best baseline + margin (default 0.03)
2. **95% bootstrap CI lower bound strictly above the baseline** — the lift is not noise
3. ECE ≤ 0.10 — a gate firing on miscalibrated probabilities is worse than no gate

Exit codes are three-valued because *could not evaluate* is not *clean*:
`0` ship · `1` do not ship · `2` could not evaluate.

Baselines are real, not strawmen: train-majority constant, train-prior constant,
stratified random, and a per-`tag` historical-rate heuristic (`tag_prior`).

## To make a model possible, instrument these at action time

The fix is upstream in logging, not in modelling. Record, **before** the outcome:

- **tool/skill identity and arguments** (`tool_name`, target paths, arg shape)
- **the agent's own pre-action uncertainty** (it already estimates this)
- **session state**: retries so far, elapsed turn time, context-window pressure
- **model/route actually serving** — we know this degrades silently (GLM → free fallback)
- **blast radius**: files touched, whether a write/network/destructive op is proposed
- **repo state**: dirty tree, branch, whether another agent holds the file

Until several of those exist with variance across both classes, more modelling is
wasted effort. Roughly 200+ events with genuine pre-action features would be enough to
retest — the pipeline and gate are already built and will answer honestly.

## Reproduce

```bash
python3 tools/ml/build_dataset.py --out artifacts/ml/dataset.json --manifest artifacts/ml/manifest.json
python3 tools/ml/train_eval.py   --dataset artifacts/ml/dataset.json --report artifacts/ml/eval.json
bash tests/test-ml-pipeline.sh
```

Deterministic (seed 20260728); identical inputs give byte-identical reports. The
manifest carries a content hash, the exclusion list, class balance and date ranges.
