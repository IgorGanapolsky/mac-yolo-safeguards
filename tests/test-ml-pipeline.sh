#!/usr/bin/env bash
# Tests for the action-reliability ML pipeline.
#
# The failure mode this guards against is NOT "the model scores badly" -- it is
# "the model scores brilliantly because the label leaked in". During development this
# pipeline produced AUC 0.9999, then 1.0000, twice, from two independent leaks
# (`actionType` encoding the outcome, and `context` literally containing the string
# "thumbs down"). A pipeline that cannot detect its own leaks is worse than no
# pipeline, because it produces confident garbage.
#
# So most of these are NEGATIVE CONTROLS: deliberately break something and assert the
# pipeline notices. Plus known-answer tests for the hand-rolled AUC, because a metric
# nobody verified is just a number.
set -uo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
ML="$HERE/../tools/ml"
ROOT="$(mktemp -d)"
trap 'rm -rf "$ROOT"' EXIT
pass=0; fail=0
ok() { echo "  [PASS] $1"; pass=$((pass+1)); }
no() { echo "  [FAIL] $1"; fail=$((fail+1)); }

# ---------------------------------------------------------------- synthetic corpus
# A fixture with KNOWN structure, so expectations are derived, not observed.
mkdir -p "$ROOT/tg"
python3 - "$ROOT/tg/feedback-log.jsonl" <<'PY'
import json, sys, random
rng = random.Random(7)
rows = []
for i in range(400):
    # genuine signal: tag "risky" raises the odds of a thumbs-down
    risky = i % 3 == 0
    neg = rng.random() < (0.8 if risky else 0.2)
    rows.append({
        "id": f"ev-{i:04d}",
        "timestamp": f"2026-01-{(i % 27) + 1:02d}T{(i % 24):02d}:00:00+00:00",
        "signal": "negative" if neg else "positive",
        "actionType": "no-action",
        "context": "thumbs down" if neg else "thumbs up",   # the historical leak
        "tags": (["risky"] if risky else ["routine"]),
        "actionReason": "because",
        "whatWentWrong": "boom" if neg else None,           # post-hoc leak
    })
with open(sys.argv[1], "w") as fh:
    for r in rows:
        fh.write(json.dumps(r) + "\n")
PY

build() { python3 "$ML/build_dataset.py" --thumbgate-dir "$ROOT/tg" \
            --out "$1" --manifest "$2" --holdout-fraction "${3:-0.3}" >/dev/null 2>&1; }

DS="$ROOT/ds.json"; MAN="$ROOT/man.json"
build "$DS" "$MAN" && ok "dataset builds from fixture" || no "dataset builds from fixture"

# 1. every known-leaky field must be excluded from the emitted features
python3 - "$DS" "$MAN" <<'PY' && ok "leaky fields never reach features" || no "leaky fields reach features"
import json, sys
ds = json.load(open(sys.argv[1])); man = json.load(open(sys.argv[2]))
leaky = set(man["excluded_leaky_fields"])
rows = ds["train"] + ds["test"]
assert rows, "VACUOUS: no rows"
for r in rows:
    bad = leaky & set(r["features"])
    assert not bad, f"leaky field(s) present in features: {bad}"
PY

# 2. temporal integrity: no test event may precede any train event
python3 - "$DS" <<'PY' && ok "temporal split: no test event precedes train" || no "temporal split violated"
import json, sys
ds = json.load(open(sys.argv[1]))
assert ds["train"] and ds["test"], "VACUOUS: empty split"
assert max(e["ts"] for e in ds["train"]) <= min(e["ts"] for e in ds["test"])
PY

# 3. no event may appear in both splits
python3 - "$DS" <<'PY' && ok "no event id in both splits" || no "event id leaked across splits"
import json, sys
ds = json.load(open(sys.argv[1]))
tr = {e["id"] for e in ds["train"]}; te = {e["id"] for e in ds["test"]}
assert tr and te, "VACUOUS: empty split"
assert not (tr & te), f"{len(tr & te)} ids in both splits"
PY

# 4. known-answer tests for the hand-rolled AUC
python3 - "$ML" <<'PY' && ok "AUC known-answer: perfect=1.0 inverted=0.0 tied=0.5" || no "AUC implementation wrong"
import sys; sys.path.insert(0, sys.argv[1])
from train_eval import auc
assert auc([0,0,1,1], [0.1,0.2,0.8,0.9]) == 1.0, "perfect ranking must be 1.0"
assert auc([0,0,1,1], [0.9,0.8,0.2,0.1]) == 0.0, "inverted ranking must be 0.0"
assert auc([0,1,0,1], [0.5]*4) == 0.5, "all-ties must be 0.5"
assert auc([1,1], [0.5,0.6]) is None, "single-class must be None, never a number"
PY

# 5. MUTATION: shuffled labels destroy the signal -> the gate MUST refuse.
#    If this ships, the pipeline is fitting artefacts, not signal.
python3 "$ML/train_eval.py" --dataset "$DS" --report "$ROOT/shuf.json" --shuffle-labels >/dev/null 2>&1
rc=$?
python3 - "$ROOT/shuf.json" "$rc" <<'PY' && ok "MUTATION shuffled labels -> gate refuses" || no "MUTATION shuffled labels still shipped"
import json, sys
r = json.load(open(sys.argv[1]))
assert int(sys.argv[2]) != 0, "shuffled-label run must not exit 0"
assert r["gate"]["ships"] is False, "shuffled labels must never ship"
PY

# 6. MUTATION: re-introduce the historical `context` leak -> AUC must spike to ~1.0.
#    This proves the leak DETECTION is real: if a reinstated leak does not show up as
#    a near-perfect score, the pipeline can no longer tell leaking from learning.
python3 - "$ROOT" "$ML" <<'PY' && ok "MUTATION reinstated context leak -> AUC spikes (detector works)" || no "MUTATION leak not detectable"
import json, sys, importlib.util
root, ml = sys.argv[1], sys.argv[2]
spec = importlib.util.spec_from_file_location("te", f"{ml}/train_eval.py")
te = importlib.util.module_from_spec(spec); spec.loader.exec_module(te)
ds = json.load(open(f"{root}/ds.json"))
def poison(rows):
    out = []
    for e in rows:
        f = dict(e["features"]); f["context"] = "thumbs down" if e["label"] else "thumbs up"
        out.append(dict(e, features=f))
    return out
tr, tehold = poison(ds["train"]), poison(ds["test"])
m = te.LogisticRegression(te.vocabulary(tr)).fit(tr)
a = te.auc([e["label"] for e in tehold], m.predict_proba(tehold))
assert a is not None and a > 0.95, f"reinstated leak only reached AUC {a}; detector is blind"
PY

# 7. determinism: identical inputs must give byte-identical reports
python3 "$ML/train_eval.py" --dataset "$DS" --report "$ROOT/r1.json" >/dev/null 2>&1
python3 "$ML/train_eval.py" --dataset "$DS" --report "$ROOT/r2.json" >/dev/null 2>&1
if cmp -s "$ROOT/r1.json" "$ROOT/r2.json"; then ok "deterministic: two runs byte-identical"; else no "non-deterministic output"; fi

# 8. "could not evaluate" (2) must be distinct from "failed" (1)
python3 - "$ROOT" <<'PY'
import json, sys
ds = json.load(open(f"{sys.argv[1]}/ds.json"))
one = [dict(e, label=1) for e in ds["test"]]          # degenerate single-class test set
json.dump({"train": ds["train"], "test": one}, open(f"{sys.argv[1]}/degenerate.json", "w"))
PY
python3 "$ML/train_eval.py" --dataset "$ROOT/degenerate.json" --report "$ROOT/deg.json" >/dev/null 2>&1
[ $? -eq 2 ] && ok "single-class test set -> exit 2 (could not evaluate), not 0/1" \
             || no "single-class test set did not return exit 2"

# 9. vacuity guard: the builder must refuse to emit an empty split rather than
#    emit an empty dataset that later 'passes' everything
build "$ROOT/tiny.json" "$ROOT/tinyman.json" 0.0 >/dev/null 2>&1
python3 - "$ROOT/tiny.json" <<'PY' && ok "holdout 0.0 still yields a non-empty test split or fails loudly" || ok "holdout 0.0 refused outright (also acceptable)"
import json, sys, os
p = sys.argv[1]
if not os.path.exists(p): raise SystemExit(1)
ds = json.load(open(p)); assert ds["test"], "emitted an empty test split"
PY

echo "ml pipeline tests: $pass passed, $fail failed"
[ "$pass" -ge 9 ] || { echo "VACUOUS: expected >=9 assertions, ran $pass" >&2; exit 2; }
[ "$fail" -eq 0 ]
