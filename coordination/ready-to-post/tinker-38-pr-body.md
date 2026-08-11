# Ready-to-post: PR for thinking-machines-lab/tinker#38

**Target repo:** https://github.com/thinking-machines-lab/tinker
**Fork branch (already pushed, verified):** `igorganapolsky/tinker@fix/sync-only-async-method-name-issue-38`
**Head commit:** `a2ba02e`, branched from upstream `main` at `2026-08-08`
**Base:** `main`
**Posting account:** IgorGanapolsky (via Mac-side `gh` — this CCR session's GitHub scope is
locked to `igorganapolsky/mac-yolo-safeguards` + its two attached forks and cannot call
`create_pull_request` against `thinking-machines-lab/tinker`; confirmed today via a real
(non-probing) attempt — `Access denied: repository "thinking-machines-lab/tinker" is not
configured for this session`).
**ThumbGate mention:** none — not applicable to this issue.

Post with:
```
gh pr create \
  --repo thinking-machines-lab/tinker \
  --head igorganapolsky:fix/sync-only-async-method-name-issue-38 \
  --base main \
  --draft \
  --title "fix(sync_only): suggest real async method name for _sync-suffixed methods" \
  --body-file <this file's PR body section below>
```

---

## PR title

fix(sync_only): suggest real async method name for _sync-suffixed methods

## PR body

### The bug

`make_error_message()` in `src/tinker/lib/sync_only.py` builds the suggested async counterpart
name as `f"{method_name}_async"` unconditionally. That's correct for most methods (`result` →
`result_async`), but it's wrong for methods whose own name already ends in `_sync` — e.g.
`Telemetry.log_fatal_exception_sync`, whose real async counterpart is `log_fatal_exception` (the
suffix is *replaced*, not appended). The unconditional append produces a nonexistent method name.

This is visible firsthand in #38: the error text quoted there is
`Use 'Telemetry.log_fatal_exception_sync_async()' instead.` —
`log_fatal_exception_sync_async` does not exist anywhere in the SDK; the real method is
`Telemetry.log_fatal_exception`.

### The fix

Added `_suggest_async_method_name()`: strips a trailing `_sync` when present (dropping it
entirely, matching the real naming convention used by
`Telemetry.log_fatal_exception_sync`/`log_exception_sync`), otherwise falls back to appending
`_async` as before.

### Before / after (verified locally)

Before the fix, calling a `_sync`-suffixed method from an async context produces:
```
Use 'Telemetry.log_fatal_exception_sync_async()' instead.
```
(a nonexistent method — matches the error text quoted in #38)

After the fix:
```
Use 'Telemetry.log_fatal_exception()' instead.
```

### Verification

New regression tests in `src/tinker/lib/sync_only_test.py` (5 cases: the helper directly,
`make_error_message()`, and an end-to-end `asyncio.run()` call through the `@sync_only`
decorator), run in a fresh `uv venv --python 3.12` against the repo's own `pyproject.toml`
(`pip install -e . pytest pytest-asyncio pytest-xdist`, public PyPI):
```
python -m pytest src/tinker/lib/sync_only_test.py -v
============================== 5 passed in 1.65s ===============================
```
Confirmed these tests fail against the unfixed code — stashing just the `sync_only.py` change
and re-running (with `-o addopts=""` to bypass the repo's default `-n` xdist flag) gives:
```
ImportError: cannot import name '_suggest_async_method_name' from 'tinker.lib.sync_only'
=========================== short test summary info ============================
ERROR src/tinker/lib/sync_only_test.py
```

Also ran the full existing `telemetry_test.py` + `sync_only_test.py` suite together to confirm
no regressions:
```
python -m pytest src/tinker/lib/telemetry_test.py src/tinker/lib/sync_only_test.py -v
============================== 65 passed in 1.33s ===============================
```

Fixes #38.
