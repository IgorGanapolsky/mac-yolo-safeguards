# Ready-to-post: forensic comment + reference patch for 1jehuang/jcode#869

**Target:** https://github.com/1jehuang/jcode/issues/869 (Codex quota widget shows two weekly bars when the hourly window is absent)
**Posting account:** IgorGanapolsky (via Mac-side `gh` — this CCR session cannot post cross-owner).
**Format rationale:** jcode restricts PR creation to collaborators; CONTRIBUTING.md says external
PRs are treated as reference proposals and the maintainer rewrites accepted ideas. The
highest-acceptance contribution format is a forensic comment: confirmed root cause + minimal
patch + regression test + before/after evidence. Patch file: `coordination/patches/jcode-869-weekly-only-dedupe.patch`.
**Shelf life:** the repo's automated triage sweep closes issue bands within days — verify #869
is still open and unlabeled before posting.

---

Root cause confirmed on master `5ae2385`, in `classify_openai_limits`
(`crates/jcode-base/src/usage/openai_helpers.rs:80`):

When the provider reports only a weekly window, the loop classifies it into `seven_day`
(line 99–101) **and** pushes the same window into `generic_non_spark` (line 102). The
`five_hour` fallback then blindly takes `generic_non_spark.first()` (line 106–108) — the
same weekly window — so the widget renders it twice. The existing dedupe guard (lines
109–119) only protects the `seven_day` fallback from duplicating `five_hour`, not the
reverse direction.

Minimal fix — make the `five_hour` fallback symmetric with the existing `seven_day` guard
(skip any window already classified as weekly):

```rust
if five_hour.is_none() {
    // A window already classified as weekly must not also fill the hourly
    // slot, or a weekly-only account renders two identical weekly bars.
    five_hour = generic_non_spark
        .iter()
        .find(|w| {
            seven_day
                .as_ref()
                .map(|s| s.name != w.name || s.resets_at != w.resets_at)
                .unwrap_or(true)
        })
        .cloned();
}
```

Behavior is unchanged for every other shape: both-windows-present, generic-unnamed-only
(still fills the hourly slot first), and spark classification are untouched — the second
regression test below locks the generic-only case specifically so the dedupe can't
over-reach.

Verification (both tests added to `crates/jcode-base/src/usage/tests.rs`):

- `test_classify_openai_limits_weekly_only_does_not_duplicate_into_hourly` — **fails on
  current master** with `five_hour = Some(weekly)` (the reported double-bar), passes with
  the fix (`seven_day = weekly`, `five_hour = None`).
- `test_classify_openai_limits_generic_only_still_fills_hourly_slot` — passes before and
  after (guards against the dedupe over-reaching).
- Full `cargo test -p jcode-base usage::` suite: green with the fix; only the new
  weekly-only test red without it.

Full patch (fix + both tests) attached below / available as a `git am`-able file — treat it
as a reference per CONTRIBUTING; happy for it to be rewritten.
