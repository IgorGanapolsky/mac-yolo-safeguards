## Summary

`build_add_member` (kind:9000, `crates/buzz-sdk/src/builders.rs`) did not call
`allow_self_tagging()` before signing. nostr 0.44's `EventBuilder` strips any
`p` tag matching the signer's own pubkey by default — every other builder
with a legitimate self-targeting use case (`build_message`,
`build_forum_post`, `build_forum_comment`, the NIP-IA self-attestation paths)
already opts in via `allow_self_tagging()`, but `build_add_member` didn't. So
a user granting themselves membership on a channel (`buzz channels
add-member --pubkey <own-pubkey>`) silently lost the `p` tag before signing,
and the relay rejected the resulting event with a "missing p tag" error that
gave no hint the SDK had dropped it — the failure surfaced as a relay
rejection with no connection back to the actual cause.

Fix: add `.allow_self_tagging()` to `build_add_member`, matching the existing
convention used everywhere else in this file.

### Related issue

Fixes #6241.

### Testing

Added `add_member_preserves_self_targeted_p_tag`, mirroring the existing
`message_preserves_self_mention_p_tag` convention: signs a self-targeted
add-member event and asserts the `p` tag survives signing.

- **Fail-before:** reverted just the `.allow_self_tagging()` call and ran the
  new test in isolation → failed with `self-targeted p tag must survive
  signing` (assertion panic), confirming it reproduces the reported bug.
- **Pass-after:** restored the fix → full `buzz-sdk` suite, `cargo test --lib`
  → **263 passed, 0 failed**.
- `cargo clippy --lib --tests -- -D warnings` → clean.
- `cargo fmt -- --check` → clean.
