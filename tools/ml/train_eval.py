#!/usr/bin/env python3
"""Train and GATE the action-reliability classifier. Pure stdlib, deterministic.

Predicts P(action gets thumbed down) from features observable at action time.

No numpy/sklearn on purpose. At ~1.8k rows a dependency-free implementation is the
more reliable choice: it runs identically in CI, on the RAM-starved mini, and here,
with no version skew and nothing to audit but this file.

The point of this script is the GATE, not the model. A model only "ships" if it beats
the honest baselines on a temporally held-out set. Exit codes are deliberately
three-valued because "could not evaluate" is not "clean":

    0 = model beat the baselines (ship)
    1 = model did NOT beat the baselines (do not ship)
    2 = could not evaluate (empty split, degenerate labels)

Primary metric is AUC, not accuracy. The train period is 63% negative and the test
period 47.8% negative, so accuracy mostly measures how well a constant matches the
current prior. AUC is threshold-free and survives that shift. Calibration (Brier/ECE)
is reported because a gate that fires on a miscalibrated probability is worse than no
gate.
"""
from __future__ import annotations

import argparse
import json
import math
import random
import sys

SEED = 20260728


# ---------------------------------------------------------------- featurisation
def featurise(event):
    """Feature name -> value. Sorted downstream so ordering never affects results."""
    feats = {"__bias__": 1.0}
    f = event.get("features", {})

    action = f.get("actionType")
    if isinstance(action, str) and action:
        feats[f"action={action.strip().lower()}"] = 1.0

    tags = f.get("tags")
    if isinstance(tags, list):
        for t in tags:
            if isinstance(t, str) and t.strip():
                feats[f"tag={t.strip().lower()}"] = 1.0

    # Presence of a reason is itself observable at action time.
    feats["has_reason"] = 1.0 if f.get("actionReason") else 0.0

    # Deliberately NO `context` path. context is the verdict verbatim ("thumbs down" /
    # "thumbs up"); featurising it scored AUC 1.0 and the gate SHIPPED the worthless
    # model. Consuming an excluded field here would make this a leak amplifier rather
    # than a leak detector, so it is never read -- and main() refuses any dataset that
    # still carries it.
    return feats


def vocabulary(events):
    vocab = set()
    for e in events:
        vocab.update(featurise(e))
    return sorted(vocab)  # sorted => deterministic weight indexing


# ---------------------------------------------------------------- model
class LogisticRegression:
    """Batch gradient descent with L2. Deterministic given the same inputs."""

    def __init__(self, vocab, l2=1.0, lr=0.5, epochs=300):
        self.index = {name: i for i, name in enumerate(vocab)}
        self.w = [0.0] * len(vocab)
        self.l2, self.lr, self.epochs = l2, lr, epochs

    def _score(self, feats):
        s = 0.0
        for name, val in feats.items():
            i = self.index.get(name)
            if i is not None:
                s += self.w[i] * val
        return s

    @staticmethod
    def _sigmoid(z):
        if z >= 0:
            return 1.0 / (1.0 + math.exp(-z))
        e = math.exp(z)
        return e / (1.0 + e)

    def fit(self, rows):
        X = [featurise(e) for e in rows]
        y = [e["label"] for e in rows]
        n = len(rows)
        if n == 0:
            return self
        for _ in range(self.epochs):
            grad = [0.0] * len(self.w)
            for feats, label in zip(X, y):
                err = self._sigmoid(self._score(feats)) - label
                for name, val in feats.items():
                    i = self.index.get(name)
                    if i is not None:
                        grad[i] += err * val
            for i in range(len(self.w)):
                g = grad[i] / n + (self.l2 / n) * self.w[i]
                self.w[i] -= self.lr * g
        return self

    def predict_proba(self, rows):
        return [self._sigmoid(self._score(featurise(e))) for e in rows]


# ---------------------------------------------------------------- metrics
def auc(y, p):
    """Rank-based AUC with tie handling. None when only one class is present."""
    pos = [s for s, t in zip(p, y) if t == 1]
    neg = [s for s, t in zip(p, y) if t == 0]
    if not pos or not neg:
        return None
    order = sorted(range(len(p)), key=lambda i: p[i])
    ranks, i = [0.0] * len(p), 0
    while i < len(order):
        j = i
        while j + 1 < len(order) and p[order[j + 1]] == p[order[i]]:
            j += 1
        avg = (i + j) / 2.0 + 1.0
        for k in range(i, j + 1):
            ranks[order[k]] = avg
        i = j + 1
    rank_sum = sum(r for r, t in zip(ranks, y) if t == 1)
    return (rank_sum - len(pos) * (len(pos) + 1) / 2.0) / (len(pos) * len(neg))


def classification_metrics(y, p, threshold=0.5):
    tp = sum(1 for a, b in zip(y, p) if a == 1 and b >= threshold)
    fp = sum(1 for a, b in zip(y, p) if a == 0 and b >= threshold)
    fn = sum(1 for a, b in zip(y, p) if a == 1 and b < threshold)
    tn = sum(1 for a, b in zip(y, p) if a == 0 and b < threshold)
    prec = tp / (tp + fp) if tp + fp else 0.0
    rec = tp / (tp + fn) if tp + fn else 0.0
    f1 = 2 * prec * rec / (prec + rec) if prec + rec else 0.0
    brier = sum((b - a) ** 2 for a, b in zip(y, p)) / len(y) if y else None
    # 10-bin expected calibration error
    ece, n = 0.0, len(y)
    for b in range(10):
        lo, hi = b / 10.0, (b + 1) / 10.0
        idx = [i for i, s in enumerate(p) if (s >= lo and s < hi) or (b == 9 and s == 1.0)]
        if idx:
            conf = sum(p[i] for i in idx) / len(idx)
            acc = sum(y[i] for i in idx) / len(idx)
            ece += (len(idx) / n) * abs(conf - acc)
    return {
        "accuracy": round((tp + tn) / len(y), 4) if y else None,
        "precision": round(prec, 4), "recall": round(rec, 4), "f1": round(f1, 4),
        "auc": round(auc(y, p), 4) if auc(y, p) is not None else None,
        "brier": round(brier, 4) if brier is not None else None,
        "ece": round(ece, 4),
        "confusion": {"tp": tp, "fp": fp, "fn": fn, "tn": tn},
    }


def bootstrap_auc_ci(y, p, n_boot=1000, alpha=0.05, seed=SEED):
    """Percentile bootstrap CI for AUC.

    A point estimate is not evidence. With n in the hundreds an AUC of 0.55 sits
    comfortably inside the sampling noise of 0.50, so the gate must reason about the
    LOWER BOUND, never the point estimate. Returns (lo, hi) or (None, None).
    """
    idx = list(range(len(y)))
    if len(idx) < 20:
        return None, None
    rng = random.Random(seed)
    scores = []
    for _ in range(n_boot):
        sample = [idx[rng.randrange(len(idx))] for _ in idx]
        ys = [y[i] for i in sample]
        if len(set(ys)) < 2:
            continue
        a = auc(ys, [p[i] for i in sample])
        if a is not None:
            scores.append(a)
    if len(scores) < n_boot * 0.5:
        return None, None
    scores.sort()
    lo = scores[int((alpha / 2) * len(scores))]
    hi = scores[min(len(scores) - 1, int((1 - alpha / 2) * len(scores)))]
    return round(lo, 4), round(hi, 4)


def baselines(train, test):
    ytr = [e["label"] for e in train]
    yte = [e["label"] for e in test]
    prior = sum(ytr) / len(ytr) if ytr else 0.0
    rng = random.Random(SEED)

    out = {}
    # 1. Constant at the TRAIN majority -- what you get with no model at all.
    const = 1.0 if prior >= 0.5 else 0.0
    out["train_majority_constant"] = classification_metrics(yte, [const] * len(yte))
    # 2. Constant at the train prior probability (calibrated-but-uninformative).
    out["train_prior_constant"] = classification_metrics(yte, [prior] * len(yte))
    # 3. Stratified random draw at the train prior.
    out["stratified_random"] = classification_metrics(yte, [rng.random() for _ in yte])
    # 4. Per-TAG historical negative rate -- a real heuristic over a field the builder
    #    actually emits. The previous version keyed on actionType, which build_dataset
    #    excludes as leakage, so every lookup missed and this silently collapsed into
    #    the train-prior constant: the gate compared the model against three constants
    #    and a coin flip while claiming a non-trivial heuristic.
    rates, counts = {}, {}
    for e in train:
        for tag in (e.get("features", {}).get("tags") or ["<none>"]):
            k = str(tag).strip().lower()
            rates[k] = rates.get(k, 0) + e["label"]
            counts[k] = counts.get(k, 0) + 1
    preds = []
    for e in test:
        ks = [str(t).strip().lower() for t in (e.get("features", {}).get("tags") or ["<none>"])]
        vals = [rates[k] / counts[k] for k in ks if counts.get(k)]
        preds.append(sum(vals) / len(vals) if vals else prior)
    out["tag_prior"] = classification_metrics(yte, preds)
    return out


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--dataset", required=True)
    ap.add_argument("--report", required=True)
    ap.add_argument("--min-auc-margin", type=float, default=0.03,
                    help="model AUC must exceed the best baseline AUC by this much")
    ap.add_argument("--max-ece", type=float, default=0.10,
                    help="max expected calibration error; a gate acting on badly "
                         "calibrated probabilities is worse than no gate")
    ap.add_argument("--shuffle-labels", action="store_true",
                    help="negative control: destroy the signal; a healthy pipeline "
                         "then scores ~0.5 AUC and MUST fail the gate")
    args = ap.parse_args()

    data = json.load(open(args.dataset))
    train, test = data["train"], data["test"]

    # A dataset carrying an excluded outcome field is poisoned. Refuse it (exit 2 =
    # could not evaluate) rather than quietly scoring a leak as a triumph.
    FORBIDDEN = {"context", "actionType", "whatWentWrong", "whatWorked", "diagnosis",
                 "rubric", "distillation", "failureType", "lesson"}
    offenders = set()
    for row in (train + test):
        offenders |= FORBIDDEN & set(row.get("features", {}))
    if offenders:
        print(f"train_eval: REFUSING dataset -- features contain excluded outcome "
              f"field(s): {sorted(offenders)}. Rebuild with build_dataset.py.", file=sys.stderr)
        return 2

    if not train or not test:
        print("train_eval: VACUOUS -- empty split", file=sys.stderr)
        return 2
    if len({e["label"] for e in test}) < 2:
        print("train_eval: VACUOUS -- test set has a single class; AUC undefined", file=sys.stderr)
        return 2

    if args.shuffle_labels:
        rng = random.Random(SEED)
        labels = [e["label"] for e in train]
        rng.shuffle(labels)
        train = [dict(e, label=l) for e, l in zip(train, labels)]

    model = LogisticRegression(vocabulary(train)).fit(train)
    yte = [e["label"] for e in test]
    probs = model.predict_proba(test)
    model_metrics = classification_metrics(yte, probs)

    base = baselines(train, test)
    base_aucs = {k: v["auc"] for k, v in base.items() if v["auc"] is not None}
    best_name = max(base_aucs, key=base_aucs.get) if base_aucs else None
    best_auc = base_aucs.get(best_name, 0.5) if best_name else 0.5

    m_auc = model_metrics["auc"]
    ci_lo, ci_hi = bootstrap_auc_ci(yte, probs)
    threshold = max(best_auc, 0.5)

    # Three independent conditions, all required:
    #   1. the point estimate clears the baseline by the margin, AND
    #   2. the 95% CI lower bound is ABOVE the baseline -- i.e. the lift is not noise,
    #   3. the model is calibrated enough to threshold on (a gate firing off a
    #      miscalibrated probability is worse than no gate at all).
    beat_point = m_auc is not None and m_auc >= threshold + args.min_auc_margin
    beat_signif = ci_lo is not None and ci_lo > threshold
    calibrated = model_metrics["ece"] is not None and model_metrics["ece"] <= args.max_ece
    ships = bool(beat_point and beat_signif and calibrated)

    report = {
        "schema": "hermes-ml/eval-v1",
        "seed": SEED,
        "n_train": len(train), "n_test": len(test),
        "negative_control_shuffled_labels": bool(args.shuffle_labels),
        "model": model_metrics,
        "baselines": base,
        "best_baseline": {"name": best_name, "auc": best_auc},
        "gate": {
            "primary_metric": "auc",
            "required_point": round(threshold + args.min_auc_margin, 4),
            "observed_point": m_auc,
            "auc_ci95": [ci_lo, ci_hi],
            "required_ci_lower_above": round(threshold, 4),
            "max_ece": args.max_ece,
            "observed_ece": model_metrics["ece"],
            "checks": {"beat_point": bool(beat_point),
                       "beat_significant": bool(beat_signif),
                       "calibrated": bool(calibrated)},
            "ships": bool(ships),
        },
    }
    with open(args.report, "w") as fh:
        json.dump(report, fh, indent=2, sort_keys=True)
    print(json.dumps(report, indent=2, sort_keys=True))
    return 0 if ships else 1


if __name__ == "__main__":
    raise SystemExit(main())
