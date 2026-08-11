# Ready-to-post: PR for lancedb/lance, fixing lancedb/lancedb#3764

**Target repo:** https://github.com/lancedb/lance (the bug is filed against `lancedb/lancedb`,
but the actual code lives in `lance-core`, which is `lancedb/lance`)
**Patch (git-am-able):** `coordination/patches/lance-3764-aarch64-fallback.patch`
**Base:** `lancedb/lance@main` — patch was cut against `de2c80f` (2026-08-10); rebase if stale.
**No fork exists yet** — `igorganapolsky` has no fork of `lancedb/lance` (only
`lancedb/lancedb` is forked). This session cannot fork or push cross-owner (GitHub scope
locked to `igorganapolsky/mac-yolo-safeguards` + its two attached forks), so this fix could
only be verified and parked, not pushed.
**Posting account:** IgorGanapolsky (via Mac-side `gh`, or any session with push scope to a
fresh fork of `lancedb/lance`).
**ThumbGate mention:** none — not applicable to this issue.

Post with:
```
gh repo fork lancedb/lance --clone=false   # if not already forked
git clone https://github.com/igorganapolsky/lance /tmp/lance-fix
cd /tmp/lance-fix
git checkout -b fix/aarch64-non-listed-os-fallback-3764
git apply /path/to/coordination/patches/lance-3764-aarch64-fallback.patch
git add rust/lance-core/src/utils/cpu.rs
git commit -m "fix(lance-core): fallback aarch64 SIMD module for unlisted target_os (fixes lancedb/lancedb#3764)"
git push -u origin fix/aarch64-non-listed-os-fallback-3764
gh pr create --repo lancedb/lance --head igorganapolsky:fix/aarch64-non-listed-os-fallback-3764 \
  --base main --draft --title "fix(lance-core): fallback aarch64 SIMD module for unlisted target_os" \
  --body-file <this file's PR body section below>
```

---

## PR title

fix(lance-core): fallback aarch64 SIMD module for unlisted target_os

## PR body

### The bug

`rust/lance-core/src/utils/cpu.rs`'s `SIMD_SUPPORT` unconditionally calls
`aarch64::has_neon_f16_support()` for any `aarch64` target that isn't iOS/tvOS, but the
`aarch64` module is only ever defined for `target_os` ∈ {macos, linux, windows, android}. Any
other OS on aarch64 (FreeBSD, OpenBSD, NetBSD, illumos, ...) fails to compile with:
```
error[E0433]: failed to resolve: use of unresolved module or unlinked crate `aarch64`
```
Reported against `lancedb` (which vendors `lance-core`) as
[lancedb/lancedb#3764](https://github.com/lancedb/lancedb/issues/3764), building on aarch64
FreeBSD.

### The fix

Add a catch-all `aarch64` module, gated on `target_arch = "aarch64"` and NOT any of the
already-covered OSes, that conservatively reports no NEON fp16 support — matching the existing
fallback already used for the Windows/Android arms.

### Verification

No aarch64-FreeBSD Rust toolchain is available in the environment this was developed in
(`rustup target add aarch64-unknown-freebsd` fails — Tier-3 target needing `-Z build-std` even
if it did install), so real cross-compilation wasn't feasible there. Instead the exact
compile-time defect was isolated with a minimal structural repro using custom `sim_arch`/
`sim_os` cfg keys (avoids colliding with the host's real builtin cfgs), compiled directly with
`rustc --cfg`:

Before (buggy shape, `sim_os="freebsd"`):
```
error[E0433]: failed to resolve: use of unresolved module or unlinked crate `aarch64`
 --> before.rs:19:12
19 |         if aarch64::has_neon_f16_support() {
   |            ^^^^^^^ use of unresolved module or unlinked crate `aarch64`
error: aborting due to 1 previous error
```
After (fixed shape): `freebsd` → OK. Also re-verified `linux`, `macos`, `windows`, `android`,
`ios`, and `openbsd` (a second previously-unlisted OS) all → OK — no regressions, and the fix
also covers OpenBSD/NetBSD/illumos, not just FreeBSD.

The real fix was applied to a clone of `lance-core` and the native test suite run as
corroborating regression evidence (doesn't exercise the aarch64/FreeBSD path on x86_64/linux,
but proves no breakage to the existing arms):
```
cargo check -p lance-core   → Finished `dev` profile [unoptimized + debuginfo] target(s)
cargo test -p lance-core utils::cpu::
running 13 tests
test result: ok. 13 passed; 0 failed; 0 ignored
```

Fixes lancedb/lancedb#3764.
