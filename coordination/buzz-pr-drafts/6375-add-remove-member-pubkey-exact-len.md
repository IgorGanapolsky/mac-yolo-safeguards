# PR draft — fix(sdk): reject overlong hex pubkeys in build_add_member/build_remove_member

Fixes #6375.

Ready to open at: https://github.com/IgorGanapolsky/buzz/pull/new/fix/add-remove-member-pubkey-exact-len

## Body

Fixes #6375.

`check_hex_len(target_pubkey, 64, ...)` enforces "at least 64 hex characters," not exactly 64, so `build_add_member`/`build_remove_member` will sign a `p` tag with an overlong pubkey. The relay's `extract_p_tag_bytes` requires exactly 64 hex and rejects it, which surfaces as a misleading `missing p tag` error at delivery time instead of an input-validation error at build time.

### Fix

Switch both builders to `check_pubkey_hex` — the helper already used by `build_moderation_ban`, `build_moderation_unban`, `build_moderation_timeout`, and `build_dm_add_member` for this exact field — which enforces exact 64-hex-char length and returns the lowercased pubkey, matching the existing pattern used everywhere else in `builders.rs`. This also drops the manual `.to_ascii_lowercase()` calls and changes the error variant from `InvalidDiffMeta` to `InvalidInput`, matching the issue's suggested solution.

### Test plan

- Added `add_member_lowercases_pubkey`, `add_member_rejects_overlong_pubkey`, `add_member_rejects_short_pubkey`, `remove_member_lowercases_pubkey`, `remove_member_rejects_overlong_pubkey`, `remove_member_rejects_short_pubkey` to `builders.rs`'s test module, mirroring the existing `moderation_ban_rejects_overlong_pubkey`/`moderation_ban_lowercases_pubkey` style already in this file.
- Confirmed fail-before: with just the two builder bodies reverted (new tests kept in place), `add_member_rejects_overlong_pubkey` and `remove_member_rejects_overlong_pubkey` failed as expected — those panics are what confirm `check_hex_len`'s "at least 64" bound accepts an overlong pubkey it should reject. The two `_rejects_short_pubkey` tests passed both before and after: `check_hex_len(_, 64, _)` already rejects anything shorter than 64, so they are regression guards for the short case rather than reproductions of this defect.
- `cargo test -p buzz-sdk --lib` → 268 passed, 0 failed (with the fix restored; up from 262 before the six new tests).
- `cargo clippy -p buzz-sdk --lib --tests -- -D warnings` → clean.
- `cargo fmt -p buzz-sdk -- --check` → clean.

Scoped to `buzz-sdk` only; did not attempt a full workspace/desktop build.
