# PR draft — fix(sdk): validate mention pubkeys before signing p-tags

Fixes #6291.

Ready to open at: https://github.com/IgorGanapolsky/buzz/compare/main...IgorGanapolsky:buzz:fix/mention-tags-validate-pubkey-hex?expand=1

## Body

Fixes #6291.

`mention_tags()` in `crates/buzz-sdk/src/builders.rs` lowercased and deduped mention entries but never checked they were valid hex pubkeys before writing them into `p`-tags and signing the event. Non-hex strings, empty values, and wrong-length values were signed unchanged, per the issue's own repro.

### Fix

Route each mention through the crate's existing `check_pubkey_hex()` helper (already used by `build_agent_observer_frame`) instead of a bare `.to_ascii_lowercase()`. Invalid entries now return `SdkError::InvalidInput` instead of being signed.

### Test plan

- Added `message_rejects_non_hex_mention_pubkey`, `message_rejects_empty_mention_pubkey`, and `message_rejects_wrong_length_mention_pubkey` to `builders.rs`'s test module.
- Confirmed fail-before: with the fix reverted (leaving only the new tests), all three new tests failed — `message_rejects_wrong_length_mention_pubkey` panicked on an `Ok` build containing a `["p", "abc123"]` tag, reproducing the issue exactly.
- `cargo test -p buzz-sdk --lib` → 265 passed, 0 failed (with the fix restored).
- `cargo clippy -p buzz-sdk --lib --tests -- -D warnings` → clean.
- `cargo fmt -p buzz-sdk -- --check` → clean.

Scoped to `buzz-sdk` only; did not attempt a full workspace/desktop build.
