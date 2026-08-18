# Ready-to-post: PR for thinking-machines-lab/tinker-cookbook#896

**Target issue:** https://github.com/thinking-machines-lab/tinker-cookbook/issues/896 ("MMLU-Redux per-subject accuracy always reports a single 'unknown' bucket")
**Patch:** `coordination/patches/tinker-cookbook-896-mmlu-redux-subject.patch` (one commit, `git am` against current `thinking-machines-lab/tinker-cookbook` main)
**Posting account:** IgorGanapolsky, from a fork of `thinking-machines-lab/tinker-cookbook` — no fork exists yet (`igorganapolsky/tinker-cookbook` was not present as of this run; only `igorganapolsky/lancedb` and `igorganapolsky/tinker` do). Fork the repo first (`gh repo fork thinking-machines-lab/tinker-cookbook --clone=false` or via the GitHub UI), then `git am` the patch onto a branch and push.
**Shelf life:** re-check the issue is still open and unclaimed before posting (no open PR referenced it as of this run).

**Verified this run** (`thinking-machines-lab/tinker-cookbook` @ `f46eddd`, 2026-08-18):
- `uv sync --extra dev` succeeded; added regression tests **fail** on unpatched `main` (`KeyError: 'mmlu_redux/anatomy/accuracy'`) and **pass** after the fix.
- Full `pytest tinker_cookbook/eval/benchmarks/benchmark_test.py`: 74 passed, 4 pre-existing skips (unrelated — missing `antlr4`/recipe-comparison fixtures), no regressions.
- `ruff format --check` and `ruff check`: clean. `pyright tinker_cookbook/eval/benchmarks/mmlu_redux.py`: 0 errors.

---

## PR title
`fix(eval): mmlu_redux per-subject accuracy always buckets into "unknown"`

## PR body

Fixes #896.

**Bug:** `MMLUReduxBenchmarkBuilder.aggregate()` reads `m.get("subject", "unknown")` from each example's `metrics` dict to build the per-subject accuracy breakdown, but `MMLUReduxMessageEnv.step()` only ever puts `"subject"` into `logs`, never into `metrics` (only `{"correct": ...}` is there). Every example therefore falls into `mmlu_redux/unknown/accuracy` instead of `mmlu_redux/<subject>/accuracy` — the per-subject breakdown has never worked.

**Fix:** `Metrics` is typed `dict[str, float | int]`, so subject can't be passed through as a string. `step()` now also encodes the subject as a numeric index into the module's existing `_SUBJECTS` list (`"subject_idx"`), and `aggregate()` decodes it back via `_SUBJECTS[int(m["subject_idx"])]`. Self-contained to `mmlu_redux.py`, no changes to `_types.py`/`_runner.py`, and no change to the public `metrics`/`logs` shape for any other benchmark.

**Testing:** added `TestMMLUReduxAggregate` to `tinker_cookbook/eval/benchmarks/benchmark_test.py` (matches the file's existing per-benchmark test-class convention rather than adding a new test file):
- `test_per_subject_breakdown` — feeds `aggregate()` metrics shaped exactly like `step()` produces for two subjects, asserts each subject's accuracy is computed correctly and `mmlu_redux/unknown/accuracy` is absent. Confirmed this fails with `KeyError` on unpatched `main` and passes after the fix.
- `test_missing_subject_idx_is_skipped` — a metrics dict without `subject_idx` (e.g. hand-constructed in another test) is skipped rather than mis-bucketed.

Ran `pytest tinker_cookbook/eval/benchmarks/benchmark_test.py` (74 passed, 4 pre-existing unrelated skips), `ruff format --check`, `ruff check`, and `pyright tinker_cookbook/eval/benchmarks/mmlu_redux.py` (0 errors) locally before opening this.
