# Ready to post: comment on lancedb/lancedb#3923

**Target**: https://github.com/lancedb/lancedb/issues/3923
**Posting blocked by**: session GitHub scope (see coordination/oss-engagement-log.md, every entry since 2026-08-03) — `add_issue_comment` against `lancedb/lancedb` is denied ("not configured for this session"). Post verbatim from any session/tool with write access to that repo (Mac-side `gh`, or a properly-scoped session).

**Freshness check before posting**: confirm the issue is still open and no maintainer has already landed a fix or explained the same root cause. If someone has, this comment is superseded — don't post a duplicate.

---

## Comment body

Investigated this today. Short version: I could not reproduce the corruption using a pure-Rust construction of the repro against the exact `lance` version `lancedb` currently pins (`v11.0.0-beta.6`, 2026-08-11) — a JSON column round-tripped correctly through `add()` → `merge_insert(...).when_matched_update_all()` → scan, including `json_extract()` filters on both touched and untouched rows.

Digging into why: `rust/lance/src/dataset/write/merge_insert.rs` in that pinned version already contains explicit `convert_json_columns`/`is_arrow_json_field` handling in its fragment-update write path, with its own tests (`test_merge_insert_full_fragment_rewrite_with_json_columns`, `test_merge_insert_subschema_with_json_columns`) whose comments describe exactly this failure mode ("without conversion... causing decoder panic on subsequent reads"). `lancedb`'s own `cast_to_table_schema` also has a comment stating it deliberately leaves `arrow.json` fields untouched because lance-core's write path is expected to handle the `arrow.json` → `lance.json` conversion itself.

That's consistent with this already being fixed upstream in `lance-core` at the version `lancedb` currently bundles, independent of anything in `lancedb`'s own Rust wrapper — which would mean issue is stale rather than needing a `lancedb`-side code change.

**Important caveat — this is not a full verification of the original repro**: I only tested via a hand-built Rust `RecordBatch`/`Table` construction inside `lancedb`'s own test harness, not through the actual `pyarrow`/PyO3 path your Python repro exercises. If the corruption depends on something in the Python↔Rust extension-type boundary (e.g. how `pa.ExtensionArray.from_storage(pa.json_(), ...)` gets marshalled across PyO3) rather than the Rust write path itself, this wouldn't catch it. The concrete next step to settle this either way: run your exact Python repro (`maturin develop` + your script) against current `main` and see whether it still reproduces. If it doesn't, this can likely be closed as fixed-by-dependency-bump; if it does, the bug is specifically in the Python binding layer, not in `execute_merge_insert`'s Rust code as originally hypothesized.

Also worth noting for whoever picks this up: your cross-linked lance-core issue (lance-format/lance#8519) about `update()` may be a distinct, still-live bug even if this one turns out fixed — I didn't investigate that path.

---

**Internal notes (not for posting)**:
- Investigated in `/workspace/lancedb` (fork clone `IgorGanapolsky/lancedb`), branch `fix/merge-insert-json-encoding` based on `upstream/main` @ `6fb976cf894f5b83cd24c6d7930fc6ace47e0c52`.
- Wrote `test_merge_insert_arrow_json_into_lance_json_table` in `rust/lancedb/src/table/merge.rs` — JSON table via `add()`, `merge_insert(&["id"]).when_matched_update_all()` on a subset, concat-all-batches read-back (the earlier 2026-08-13 (AM) attempt's blocker was a batch-count assumption bug in this same test — fixed this time), plus `json_extract()` checks. Ran genuinely pre-"fix" across `memory://` and tempdir-backed variants: **passed every time**, no repro observed.
- Implemented the originally-hypothesized fix (route `merge_insert`'s `new_data` through `cast_to_table_schema`, matching `add_data.rs::into_plan`) anyway, to have it ready — but since there was no failing pre-fix test to validate against, this change was **not kept, not committed, not pushed**, per the hard rule against pushing unverified fixes. Only the regression test exists, uncommitted, in the local scratch clone.
- Next session picking this up: don't redo the Rust-level investigation, it's now been done twice (2026-08-13 AM: inconclusive due to test bug; 2026-08-13 PM: test bug fixed, no repro found at Rust level). Go straight to the Python-level verification described above.
