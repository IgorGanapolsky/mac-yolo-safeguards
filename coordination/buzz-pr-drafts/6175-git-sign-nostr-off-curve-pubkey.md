# Ready-to-submit PR — block/buzz #6175

**Branch (already pushed, DCO-signed):** `IgorGanapolsky/buzz@fix/git-sign-nostr-off-curve-pubkey`

**One-click open:**
https://github.com/block/buzz/compare/main...IgorGanapolsky:buzz:fix/git-sign-nostr-off-curve-pubkey?expand=1

**Title:** `fix(git-sign-nostr): restore on-curve BIP-340 pubkey validation`

---

Fixes #6175.

## Problem

`nostr` 0.44 changed `PublicKey::from_hex()` to only decode 32 hex bytes into a struct — it no longer performs curve-membership validation the way it did through 0.36. Four call sites in `git-sign-nostr` used `PublicKey::from_hex(x).is_err()` as their *only* BIP-340 validity gate for the NIP-OA owner pubkey (`oa[0]`):

- the sign path (owner pubkey on a configured `BUZZ_AUTH_TAG`)
- the verify path (owner pubkey on an incoming envelope's `oa` field)
- `parse_oa_tag` / envelope parsing
- a test helper mirroring the same check

After the bump, all four silently stopped rejecting off-curve keys — `PublicKey::from_hex("0".repeat(64))` now returns `Ok`, where it used to return `Err`.

The crate's own test suite already had a test that would have caught this on the next dependency bump (`test_parse_envelope_rejects_invalid_oa_pubkey`), but `git-sign-nostr` was never added to the `test-unit` enumeration in the `Justfile`, and nothing in CI runs `cargo test --workspace` — so the regression shipped and stayed invisible to CI.

Two other `from_hex` call sites in the same file (validating the *signer's* envelope pubkey, and the owner pubkey inside `verify_oa`) were **not** affected — both already call `.xonly()` on the parsed key immediately before a schnorr-verify, so an off-curve key there fails at the xonly conversion regardless of this bug. Confirmed by reading both call sites before scoping the fix to only the four sites that had no such downstream check.

## Fix

- Call `.xonly()` (which performs real curve validation via `XOnlyPublicKey::from_slice`) at each of the four gates — matching the pattern the two already-safe call sites in this file use.
- Add `git-sign-nostr` to the `test-unit` enumeration in `Justfile`, so its test suite actually executes in CI going forward.

## Verification (executed, not asserted)

```text
# Before fix, on current upstream main:
cargo test -p git-sign-nostr --lib test_parse_envelope_rejects_invalid_oa_pubkey
# FAILED — assertion failed: result.is_err() (lib.rs:2136)

# After fix:
cargo test -p git-sign-nostr --lib
# test result: ok. 56 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out

cargo clippy -p git-sign-nostr --lib --all-targets -- -D warnings   # clean
cargo fmt -p git-sign-nostr -- --check                              # clean
```

No new test was needed — the existing `test_parse_envelope_rejects_invalid_oa_pubkey` already encoded the fails-before/passes-after case; the bug was that it never ran.
