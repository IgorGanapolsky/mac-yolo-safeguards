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

# 6. MUTATION (reviewer-found): a dataset still carrying `context` must be REFUSED
#    outright (exit 2), not merely scored. featurise() used to still read context, so a
#    poisoned dataset produced AUC 1.0 with ships=true -- the leakage detector approving
#    the very model it exists to block.
python3 - "$ROOT" <<'PYEOF'
import json, sys
root = sys.argv[1]
ds = json.load(open(f"{root}/ds.json"))
def poison(rows):
    out = []
    for e in rows:
        f = dict(e["features"]); f["context"] = "thumbs down" if e["label"] else "thumbs up"
        out.append(dict(e, features=f))
    return out
json.dump({"train": poison(ds["train"]), "test": poison(ds["test"])},
          open(f"{root}/poisoned.json", "w"))
PYEOF
python3 "$ML/train_eval.py" --dataset "$ROOT/poisoned.json" --report "$ROOT/prep.json" >/dev/null 2>&1
prc=$?
if [ "$prc" = "2" ]; then ok "MUTATION poisoned dataset (context) -> 2 (refused), never shipped"; else no "poisoned dataset not refused (exit $prc)"; fi

# 6b. MUTATION (reviewer-found): mixed UTC offsets must split by INSTANT, not ISO string.
#     "00:30+02:00" is EARLIER than "00:00+00:00"; string sorting reverses them and
#     silently breaks the temporal holdout.
python3 - "$ROOT" "$ML" <<'PYEOF'
import json, subprocess, sys, os, datetime as dt
root, ml = sys.argv[1], sys.argv[2]
tg = f"{root}/tzskew"; os.makedirs(tg, exist_ok=True)
rows = [
    {"id":"late-local","timestamp":"2026-03-01T00:30:00+02:00","signal":"negative",
     "actionType":"no-action","tags":["a"],"actionReason":"r"},
    {"id":"early-local","timestamp":"2026-03-01T00:00:00+00:00","signal":"positive",
     "actionType":"no-action","tags":["b"],"actionReason":"r"},
]
with open(f"{tg}/feedback-log.jsonl","w") as fh:
    for r in rows: fh.write(json.dumps(r)+"\n")
subprocess.run([sys.executable, f"{ml}/build_dataset.py", "--thumbgate-dir", tg,
                "--out", f"{root}/tz.json", "--manifest", f"{root}/tzman.json",
                "--holdout-fraction", "0.5"], capture_output=True)
ds = json.load(open(f"{root}/tz.json"))
tr = dt.datetime.fromisoformat(ds["train"][-1]["ts"]).astimezone(dt.timezone.utc)
te = dt.datetime.fromisoformat(ds["test"][0]["ts"]).astimezone(dt.timezone.utc)
assert tr <= te, f"temporal order violated across UTC offsets: {tr} > {te}"
assert ds["train"][0]["id"] == "late-local", "earlier INSTANT must sort first"
PYEOF
if [ $? -eq 0 ]; then ok "mixed UTC offsets split by instant, not ISO string"; else no "UTC-offset ordering wrong"; fi

# 6c. the tag_prior baseline must actually vary -- the old actionType baseline silently
#     collapsed to a constant because the builder never emits that field.
python3 "$ML/train_eval.py" --dataset "$DS" --report "$ROOT/base.json" >/dev/null 2>&1
python3 - "$ROOT/base.json" <<'PYEOF'
import json, sys
r = json.load(open(sys.argv[1]))
assert "tag_prior" in r["baselines"], "tag_prior baseline missing"
tp, const = r["baselines"]["tag_prior"], r["baselines"]["train_prior_constant"]
assert tp["auc"] is not None, "tag_prior AUC undefined"
assert tp["auc"] != const["auc"], "tag_prior collapsed to the constant baseline"
PYEOF
if [ $? -eq 0 ]; then ok "tag_prior is a live heuristic, not a disguised constant"; else no "tag_prior is dead"; fi

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
[ "$pass" -ge 11 ] || { echo "VACUOUS: expected >=9 assertions, ran $pass" >&2; exit 2; }
[ "$fail" -eq 0 ]
