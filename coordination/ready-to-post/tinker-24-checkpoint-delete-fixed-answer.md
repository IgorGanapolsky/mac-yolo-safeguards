# Ready-to-post: answer for thinking-machines-lab/tinker#24

**Target:** https://github.com/thinking-machines-lab/tinker/issues/24 ("tinker checkpoint delete unexpected args")
**Posting account:** IgorGanapolsky (via Mac-side `gh` or any properly cross-owner-scoped session — this CCR session cannot post cross-owner; same wall as every prior OSS-engagement entry).
**Verified against:** `thinking-machines-lab/tinker` main, `pyproject.toml` version `0.25.0` (2026-08-11). Reporter was on `0.16.1`.
**Shelf life:** check the issue is still open before posting; if a maintainer already closed it, skip.

---

This looks fixed on current `main` (0.25.0) — you were on 0.16.1 when you hit it.

The `delete` command's positional argument used to take exactly one `checkpoint_path`; it's since been rewritten for bulk deletion and now takes `checkpoint_paths` as a variadic (`@click.argument("checkpoint_paths", nargs=-1, required=False)`, `src/tinker/cli/commands/checkpoint.py:980`), which is what accepts a bare `tinker://...` path (or several) as positional args without tripping "unexpected extra argument."

I verified this concretely rather than just reading the diff: `tests/test_checkpoint_delete.py::TestDeleteCLIValidation::test_explicit_tinker_path_deletes_checkpoint` invokes `delete -y tinker://run-1/sampler_weights/copy-test` exactly the way your original command did, and asserts `exit_code == 0`. Ran the full file locally (`pytest tests/test_checkpoint_delete.py`): **21 passed**, including that case and the `--run-id` path you used as a workaround.

If you still see this on a current install (`pip install -U tinker`, or `uv tool upgrade tinker`), that'd be a different bug worth a fresh issue with the exact command and version — but on 0.25.0 the reported repro no longer applies.
