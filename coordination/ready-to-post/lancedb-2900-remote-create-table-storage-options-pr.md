# Ready-to-post: PR for lancedb/lancedb#2900

**Target issue:** https://github.com/lancedb/lancedb/issues/2900 ("create_table() incompatibilities between LanceDBConnection and RemoteDBConnection")
**Branch:** `IgorGanapolsky/lancedb@fix/remote-create-table-storage-options` — compare: https://github.com/lancedb/lancedb/compare/main...IgorGanapolsky:fix/remote-create-table-storage-options?expand=1
**Posting account:** IgorGanapolsky, from the existing fork (Mac-side `gh` or any properly cross-owner-scoped session — this CCR session cannot open PRs cross-owner).
**Shelf life:** re-check the issue is still open/unclaimed before posting. Note the issue as originally filed also names `exist_ok`/`on_bad_vectors` as missing — both are already present on current `main`'s `RemoteDBConnection.create_table` signature, so only `storage_options` is still a real, reproducible gap; worth a short note in the PR that the issue is partially stale.

**Verified this run** (`lancedb/lancedb` @ `d742b174`, 2026-08-18, full `maturin develop` build from source):
- New test `test_create_table_storage_options` in `python/tests/test_remote_db.py` **fails** on unpatched `main` (`TypeError: RemoteDBConnection.create_table() got an unexpected keyword argument 'storage_options'`), **passes** after the fix.
- Full `pytest python/tests/test_remote_db.py`: 59 passed (one run also showed `test_remote_connection_after_fork` failing, but it passes both in isolation and in a clean full-suite re-run with the fix applied — a pre-existing fork+tokio-runtime flake unrelated to this change; reproduces identically with the fix reverted).
- `ruff format --check`, `ruff check`: clean on both touched files.

---

## PR title
`fix(python): RemoteDBConnection.create_table missing storage_options kwarg`

## PR body

Fixes (partially — see note) #2900.

**Bug:** `RemoteDBConnection.create_table` (`python/python/lancedb/remote/db.py`) doesn't accept `storage_options` at all, unlike the abstract `DBConnection.create_table` and the local `LanceDBConnection`, both of which do. Passing it raises `TypeError: unexpected keyword argument`.

**Fix:** `open_table` in the same file already has the precedent for exactly this situation on LanceDB Cloud: accept the kwarg, log that it's ignored (storage is managed; set `storage_options` on `connect()` instead), and don't forward it. `create_table` now follows the same pattern — no behavior change for callers not passing `storage_options`.

**Note on the original issue:** it also names `exist_ok` and `on_bad_vectors` as missing from `RemoteDBConnection.create_table`. Both are already present in the current signature, so this PR only addresses the one still-reproducible gap (`storage_options`); happy to split further work into a separate issue/PR if there's more to it.

**Testing:** added `test_create_table_storage_options` to `python/tests/test_remote_db.py`, modeled on the existing `test_create_table_exist_ok` (uses the file's `mock_lancedb_connection` HTTP-mock harness). Confirmed it fails with the reported `TypeError` on unpatched `main` and passes after the fix. Ran the full `python/tests/test_remote_db.py` suite (59 passed) and `ruff format --check`/`ruff check` locally before opening this.
