# Ready-to-post: PR for lancedb/lancedb#3915

**Target:** https://github.com/lancedb/lancedb/issues/3915 (`list_tables()` page-token pagination
skips one table per page boundary)
**Posting account:** IgorGanapolsky, from fork `igorganapolsky/lancedb` (this CCR session is
scope-blocked from forking/pushing to any repo outside `igorganapolsky/mac-yolo-safeguards` — see
the 2026-08-11 oss-engagement-log entry. Post via Mac-side `gh`/git or any properly-scoped
session.)
**Branch:** `fix/list-tables-pagination-boundary`
**Patch:** `coordination/patches/lancedb-3915-pagination-fix.patch` (git-am-able against
`lancedb/lancedb` main as of commit `a615306`)
**Verified locally** (`cargo test --lib database::listing::tests::` in `rust/lancedb`, toolchain
1.97.0):
- Before fix: `test_list_tables_pagination_does_not_skip_boundary_table` **FAILS** —
  `left: [...t04, t06...]` vs `right: [...t04, t05, t06...]` (t05 and t11, the first table of
  pages 2 and 3, are silently dropped) — this is the exact symptom in the issue.
- After fix: **31 passed, 0 failed** in `database::listing::tests::` (all pre-existing tests in
  the module still pass, so `start_after`/`table_names()` — a separate, correctly-exclusive
  field — is untouched).
- `cargo fmt --check` clean on the changed file.

**Shelf life:** re-check #3915 is still open and unclaimed before posting (no assignee/PR linked
as of 2026-08-11).

---

## PR title

fix(rust): `list_tables()` pagination must not skip the first table of each page

## PR body

Fixes #3915.

### The bug

`list_tables()`'s page-token pagination silently drops exactly one table at every page
boundary. With 15 tables and `limit: 5`, a full paginated walk returns 13 tables instead of 15 —
`t05` and `t11`, the first table of pages 2 and 3, never appear on any page.

### Root cause

In `ListingDatabase::list_tables` (`rust/lancedb/src/database/listing.rs`), the token handed
back for the next page is the name of the first table *of that next page* — an inclusive
starting position, matching the documented API contract in `docs/openapi.yml` ("Specifies the
starting position of the next query"):

```rust
let next_page_token = if let Some(limit) = request.limit {
    if f.len() > limit as usize {
        let token = f[limit as usize].clone(); // <- first table of the NEXT page
        f.truncate(limit as usize);
        Some(token)
    } else { None }
} else { None }
```

But the code that consumes that token on the following call filters with a **strict** `>`:

```rust
if let Some(ref page_token) = request.page_token {
    let index = f
        .iter()
        .position(|name| name.as_str() > page_token.as_str()) // excludes page_token itself
        .unwrap_or(f.len());
    f.drain(0..index);
}
```

Since `page_token` is meant to be included in the next page, the comparison needs to be `>=`.
(This is a different field from the deprecated `table_names()`'s `start_after`, which is
correctly exclusive by name and is untouched by this fix.)

### Fix

One-line change: `>` → `>=` in the `page_token` filter, plus a doc comment explaining the
inclusive-token contract so the next reader doesn't "fix" it back.

### Before / after

Reproduction from the issue, adapted as a regression test
(`test_list_tables_pagination_does_not_skip_boundary_table`, creates 15 tables, paginates with
`limit: 5`, asserts every table comes back exactly once):

- **Before fix:** test fails —
  `left: [t00, t01, t02, t03, t04, t06, t07, t08, t09, t10, t12, t13, t14]` vs
  `right: [t00, t01, ..., t14]` (t05, t11 missing).
- **After fix:** `cargo test --lib database::listing::tests::` → **31 passed, 0 failed**.

### Verification

```
$ cargo test --lib database::listing::tests:: --  --nocapture
test result: ok. 31 passed; 0 failed; 0 ignored; 0 measured; 473 filtered out
$ cargo fmt --check rust/lancedb/src/database/listing.rs
(clean)
```

Full patch (fix + regression test), `git am`-able:
`coordination/patches/lancedb-3915-pagination-fix.patch` in `igorganapolsky/mac-yolo-safeguards`.
