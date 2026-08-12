# Ready-to-post: answer for thinking-machines-lab/tinker#51

**Target:** https://github.com/thinking-machines-lab/tinker/issues/51 ("ServiceClient() TLS handshake fails (UnknownIssuer) out of the box: pyqwest 0.7.0 breaking change not handled")
**Posting account:** IgorGanapolsky (via Mac-side `gh` or any properly cross-owner-scoped session — this CCR session cannot post cross-owner; same wall as every prior OSS-engagement entry).
**Verified against:** `thinking-machines-lab/tinker` main, `pyproject.toml` version `0.25.0` (2026-08-12). Reporter was on 0.23.0/0.23.1.
**Shelf life:** check the issue is still open before posting; if a maintainer already closed it, skip.
**Companion PR (parked, same wall):** `IgorGanapolsky/tinker@test/pyqwest-transport-tls-regression` — regression test for this fix, since none existed. Compare: https://github.com/thinking-machines-lab/tinker/compare/main...IgorGanapolsky:tinker:test/pyqwest-transport-tls-regression?expand=1

---

This is fixed on current `main` (0.25.0) — you were on 0.23.0/0.23.1.

`_default_pyqwest_transport()` (`src/tinker/_base_client.py:748`) now does exactly what you suggested:

```python
try:
    transport = pyqwest.HTTPTransport(tls_include_system_certs=True)
except TypeError:
    transport = pyqwest.HTTPTransport()
```

with a comment crediting the same root cause you diagnosed (pyqwest 0.7.0 flipping `tls_include_system_certs` to default `False`). I couldn't find the exact commit/PR number that landed it, but it's present as of the current `main` checkout.

I also noticed there was no test covering either branch of that fallback, so I added one (`tests/test_pyqwest_transport.py`) — it fakes out `pyqwest.HTTPTransport` via `sys.modules` (no real pyqwest install needed) and checks both the `tls_include_system_certs=True` path and the `TypeError` fallback for pyqwest <0.7.0. Verified it actually catches this class of regression: reverted `_default_pyqwest_transport` locally to the pre-fix call (bare `pyqwest.HTTPTransport()`, your exact repro), reran — both new tests failed with the expected diff; restored the fix, reran — both passed. Full `uv run pytest tests/` suite is green on top of it.

If you're still seeing `UnknownIssuer` on a fresh `pip install -U tinker`, that'd be a new bug worth its own issue with the exact `tinker`/`pyqwest` versions — but the 0.23.x behavior you hit is already gone on 0.25.0.
