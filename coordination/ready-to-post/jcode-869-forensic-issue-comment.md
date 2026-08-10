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

Full patch (fix + both tests) below, `git am`-able — treat it as a reference per
CONTRIBUTING; happy for it to be rewritten.

<details>
<summary>jcode-869-weekly-only-dedupe.patch</summary>

```diff
From e6354313f3dee8052e190eaa7e775d78379bff2b Mon Sep 17 00:00:00 2001
From: Igor Ganapolsky <iganapolsky@gmail.com>
Date: Mon, 10 Aug 2026 18:32:08 +0000
Subject: [PATCH] fix(usage): weekly-only Codex account must not duplicate
 weekly window into hourly slot

Regression tests for 1jehuang/jcode#869
---
 crates/jcode-base/src/usage/openai_helpers.rs | 12 +++++-
 crates/jcode-base/src/usage/tests.rs          | 43 +++++++++++++++++++
 2 files changed, 54 insertions(+), 1 deletion(-)

diff --git a/crates/jcode-base/src/usage/openai_helpers.rs b/crates/jcode-base/src/usage/openai_helpers.rs
index a96de90..6c8584f 100644
--- a/crates/jcode-base/src/usage/openai_helpers.rs
+++ b/crates/jcode-base/src/usage/openai_helpers.rs
@@ -104,7 +104,17 @@ pub(super) fn classify_openai_limits(limits: &[UsageLimit]) -> OpenAIUsageData {
     }
 
     if five_hour.is_none() {
-        five_hour = generic_non_spark.first().cloned();
+        // A window already classified as weekly must not also fill the hourly
+        // slot, or a weekly-only account renders two identical weekly bars.
+        five_hour = generic_non_spark
+            .iter()
+            .find(|w| {
+                seven_day
+                    .as_ref()
+                    .map(|s| s.name != w.name || s.resets_at != w.resets_at)
+                    .unwrap_or(true)
+            })
+            .cloned();
     }
     if seven_day.is_none() {
         seven_day = generic_non_spark
diff --git a/crates/jcode-base/src/usage/tests.rs b/crates/jcode-base/src/usage/tests.rs
index 8b2bc0b..8a431f3 100644
--- a/crates/jcode-base/src/usage/tests.rs
+++ b/crates/jcode-base/src/usage/tests.rs
@@ -227,6 +227,49 @@ fn test_classify_openai_limits_recognizes_five_weekly_and_spark() {
     assert_eq!(classified.spark.as_ref().map(|w| w.usage_ratio), Some(0.75));
 }
 
+#[test]
+fn test_classify_openai_limits_weekly_only_does_not_duplicate_into_hourly() {
+    // Regression for #869: with the hourly window absent, the weekly limit was
+    // classified as seven_day AND swept into the generic five_hour fallback,
+    // rendering two identical weekly bars in the quota widget.
+    let limits = vec![UsageLimit {
+        name: "Codex weekly".to_string(),
+        usage_percent: 40.0,
+        resets_at: Some("2026-01-07T00:00:00Z".to_string()),
+    }];
+
+    let classified = openai_helpers::classify_openai_limits(&limits);
+
+    assert_eq!(
+        classified.seven_day.as_ref().map(|w| w.usage_ratio),
+        Some(0.4)
+    );
+    assert!(
+        classified.five_hour.is_none(),
+        "weekly window must not also fill the hourly slot, got {:?}",
+        classified.five_hour
+    );
+}
+
+#[test]
+fn test_classify_openai_limits_generic_only_still_fills_hourly_slot() {
+    // The pre-#869 fallback behavior for an unnamed window must survive the
+    // dedupe: a window matching neither pattern still lands in five_hour.
+    let limits = vec![UsageLimit {
+        name: "Codex usage".to_string(),
+        usage_percent: 30.0,
+        resets_at: Some("2026-01-01T00:00:00Z".to_string()),
+    }];
+
+    let classified = openai_helpers::classify_openai_limits(&limits);
+
+    assert_eq!(
+        classified.five_hour.as_ref().map(|w| w.usage_ratio),
+        Some(0.3)
+    );
+    assert!(classified.seven_day.is_none());
+}
+
 #[test]
 fn test_parse_usage_percent_supports_used_limit_shape() {
     let mut obj = serde_json::Map::new();
-- 
2.43.0

```

</details>
