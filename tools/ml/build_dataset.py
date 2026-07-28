#!/usr/bin/env python3
"""Build a leakage-free, versioned dataset for the action-reliability classifier.

Task: given an agent action, predict whether it will be thumbed DOWN (negative).
That is ThumbGate's product thesis, so it is the only model worth building here.

Why this file is mostly integrity checks rather than feature engineering
-----------------------------------------------------------------------
The raw corpus looks like ~5,588 labelled signals across 19 JSONL files. It is not.
Measured 2026-07-28:

  * ALL 716 `lessons-index.feedbackId` values point at `feedback-log.id` events, and
    ALL 716 carry the identical label -> 716 duplicate events.
  * ALL 383 `attributed-feedback.attribution_id` values also appear in
    `feedback-attributions` -> 383 more duplicates.
  * `attributed-feedback.jsonl` is 100% negative (946/946). Training on it alone
    yields a model that predicts "bad" always at 100% "accuracy".
  * `whatWentWrong` is present in 80% of negatives and 0% of positives;
    `whatWorked` in 53% of positives and 0% of negatives. Both are written AFTER
    the outcome is known, so using either as a feature is target leakage that would
    manufacture a near-perfect and completely worthless model.

So we take `feedback-log.jsonl` as the single event source (it is the only file that
is both richly featured and genuinely two-class), which removes cross-file duplication
by construction rather than by a dedupe pass we would have to trust.

Splitting is TEMPORAL, never random: these events are a time series of one agent
fleet, and a random split lets the model see the future.

Outputs `dataset.json` plus a manifest recording the exact exclusions, counts, class
balance, date range and a content hash, so a run is reproducible and auditable.
"""
from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import os
import sys

# Fields written only AFTER the outcome is known. Never features. The test suite
# asserts none of these can reach the feature vector.
LEAKY_FIELDS = frozenset({
    "whatWentWrong", "whatWorked", "diagnosis", "rubric", "distillation",
    "failureType", "whatToChange", "structuredRule", "lesson", "priorSummary",
    "relatedFeedbackId", "revivalCondition",
    # actionType is the label written in another column. Measured 2026-07-28:
    #   store-mistake   n=393  100% negative
    #   store-learning  n=518  100% positive
    #   no-action       n=881   75% negative
    # Including it scored AUC 0.9999 -- a number that should always be read as
    # "find the leak", never as success.
    "actionType",
    # `context` is the verdict verbatim -- every value is literally "thumbs down" or
    # "thumbs up". Measured: the token "down" appears in 655 rows, 100% negative.
    # It produced AUC 1.000, i.e. perfect separation, which is always a leak.
    "context",
})

# Rows whose actionType alone determines the outcome are not predictions waiting to
# be made; the event only exists BECAUSE of its outcome. Dropping the field is not
# enough -- their context/tags are written by the same outcome-aware code path -- so
# the whole population is excluded and only genuinely undetermined events remain.
OUTCOME_ENCODING_ACTION_TYPES = frozenset({"store-mistake", "store-learning"})

# Fields observable at action time.
SAFE_FIELDS = ("tags", "actionReason")

SOURCE_FILE = "feedback-log.jsonl"


def _parse_ts(value):
    if not isinstance(value, str):
        return None
    try:
        return dt.datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


def load_events(thumbgate_dir):
    """Read the single event source. Returns (events, rejected_counts)."""
    path = os.path.join(thumbgate_dir, SOURCE_FILE)
    if not os.path.isfile(path):
        raise SystemExit(f"build_dataset: source not found: {path}")

    events, seen_ids = [], set()
    rejected = {"unparseable": 0, "no_label": 0, "no_timestamp": 0, "duplicate_id": 0,
                "outcome_encoding_action_type": 0}

    with open(path, errors="replace") as handle:
        for line in handle:
            line = line.strip()
            if not line:
                continue
            try:
                raw = json.loads(line)
            except json.JSONDecodeError:
                rejected["unparseable"] += 1
                continue
            if raw.get("signal") not in ("positive", "negative"):
                rejected["no_label"] += 1
                continue
            stamp = _parse_ts(raw.get("timestamp"))
            if stamp is None:
                # No timestamp means no honest temporal placement. Quarantine rather
                # than guess -- a guessed date silently corrupts the split.
                rejected["no_timestamp"] += 1
                continue
            action_type = (raw.get("actionType") or "").strip().lower()
            if action_type in OUTCOME_ENCODING_ACTION_TYPES:
                rejected["outcome_encoding_action_type"] += 1
                continue

            event_id = raw.get("id")
            if event_id and event_id in seen_ids:
                rejected["duplicate_id"] += 1
                continue
            if event_id:
                seen_ids.add(event_id)

            events.append({
                "id": event_id or f"anon-{len(events)}",
                "ts": stamp.isoformat(),
                # label 1 == the thing we want to predict and prevent
                "label": 1 if raw["signal"] == "negative" else 0,
                "features": {k: raw.get(k) for k in SAFE_FIELDS},
            })

    events.sort(key=lambda e: (e["ts"], e["id"]))
    return events, rejected


def temporal_split(events, holdout_fraction):
    """Split strictly by time. Every test event is at or after every train event."""
    if not events:
        return [], []
    cut = int(len(events) * (1.0 - holdout_fraction))
    cut = max(1, min(cut, len(events) - 1)) if len(events) > 1 else len(events)
    train, test = events[:cut], events[cut:]
    # Guard the invariant here too, not only in the tests: a silent leak is worse
    # than a crash.
    if train and test and max(e["ts"] for e in train) > min(e["ts"] for e in test):
        raise SystemExit("build_dataset: temporal split violated -- refusing to emit")
    return train, test


def build(thumbgate_dir, holdout_fraction):
    events, rejected = load_events(thumbgate_dir)
    train, test = temporal_split(events, holdout_fraction)

    def balance(rows):
        neg = sum(r["label"] for r in rows)
        return {"n": len(rows), "negative": neg, "positive": len(rows) - neg,
                "negative_rate": round(neg / len(rows), 4) if rows else None}

    payload = {"train": train, "test": test}
    digest = hashlib.sha256(
        json.dumps(payload, sort_keys=True, separators=(",", ":")).encode()
    ).hexdigest()

    manifest = {
        "schema": "hermes-ml/dataset-v1",
        "source_file": SOURCE_FILE,
        "source_rationale": "single event source; removes cross-file duplication by construction",
        "excluded_leaky_fields": sorted(LEAKY_FIELDS),
        "excluded_outcome_encoding_action_types": sorted(OUTCOME_ENCODING_ACTION_TYPES),
        "feature_fields": list(SAFE_FIELDS),
        "split": "temporal",
        "holdout_fraction": holdout_fraction,
        "rejected": rejected,
        "train": balance(train),
        "test": balance(test),
        "date_range": {
            "train": [train[0]["ts"], train[-1]["ts"]] if train else None,
            "test": [test[0]["ts"], test[-1]["ts"]] if test else None,
        },
        "content_sha256": digest,
    }
    return payload, manifest


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--thumbgate-dir", default=os.path.expanduser("~/.thumbgate"))
    ap.add_argument("--out", required=True)
    ap.add_argument("--manifest", required=True)
    ap.add_argument("--holdout-fraction", type=float, default=0.3)
    args = ap.parse_args()

    payload, manifest = build(args.thumbgate_dir, args.holdout_fraction)

    if not payload["train"] or not payload["test"]:
        print("build_dataset: VACUOUS -- a split is empty; refusing to emit", file=sys.stderr)
        return 2

    os.makedirs(os.path.dirname(os.path.abspath(args.out)) or ".", exist_ok=True)
    with open(args.out, "w") as fh:
        json.dump(payload, fh, sort_keys=True)
    with open(args.manifest, "w") as fh:
        json.dump(manifest, fh, indent=2, sort_keys=True)

    print(json.dumps(manifest, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
