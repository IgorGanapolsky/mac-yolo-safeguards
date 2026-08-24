# fix(cli): apply kind 40003 edits on messages get/thread read paths

**Fixes:** block/buzz#6388
**Branch:** `IgorGanapolsky/buzz@fix/messages-get-apply-edits` (off `upstream/main`)
**Open PR:** https://github.com/IgorGanapolsky/buzz/compare/main...IgorGanapolsky:buzz:fix/messages-get-apply-edits?expand=1

## Problem

`buzz messages edit` is accepted and stored as a kind 40003 event, but the CLI read paths never reflected it:

- `messages get` did not include kind 40003 in its fetch filter (`[9, 40002, 40008, 45001, 45003]`) at all, so it kept returning the original kind 9 content.
- `messages thread` *did* fetch kind 40003 but rendered the edit as a separate event alongside the stale original — which is exactly the reporter's observation (thread shows both `F` (40003, updated) and `E` (kind 9, original)).

Net effect: a write the system reports as succeeding is invisible on the authoritative read path. Bridges and agents mirroring edits into Buzz cannot verify them.

## Fix

Add `apply_message_edits`, a pure transform over the fetched event list that collapses each **authorized** kind 40003 edit onto the message it targets:

- An edit is honored only when its author (`pubkey`) matches the target message's author — a message may only be edited by its sender. A foreign "edit" neither rewrites content nor is silently discarded.
- The latest edit by `created_at` wins.
- The target's original send-time `created_at` is preserved (ordering by send time is unchanged); only `content` is replaced.
- The applied standalone kind 40003 event is dropped from output. Edits with no matching target in the returned set (e.g. a limit that excluded the base) are left in place so no data is silently discarded.

Wired into `cmd_get_messages` (also adding 40003 to the default fetch filter) and `cmd_get_thread`.

## Tests

Five new unit tests over the pure helper (`crates/buzz-cli/src/commands/messages.rs`), no network required:

- `edit_replaces_target_content_and_drops_edit_event`
- `latest_edit_by_created_at_wins`
- `edit_from_other_author_is_ignored_and_kept`
- `edit_with_absent_target_is_left_in_place`
- `non_edit_events_pass_through_unchanged`

## Verification (executed)

- **Fail-before:** with `apply_message_edits` neutered to an identity pass-through (tests kept), `edit_replaces_target_content_and_drops_edit_event` and `latest_edit_by_created_at_wins` both **FAILED**, reproducing the issue's defect (edited content invisible on read; edit event shown alongside original). Restored the fix.
- **Pass-after, module:** `cargo test -p buzz-cli --lib commands::messages::tests` → 30 passed, 0 failed.
- **Pass-after, full crate:** `cargo test -p buzz-cli --lib` → **355 passed, 0 failed, 0 ignored**.
- `cargo clippy -p buzz-cli --lib --tests -- -D warnings` → clean.
- `cargo fmt -p buzz-cli -- --check` → clean.

Commit is DCO-signed as `Igor Ganapolsky <iganapolsky@gmail.com>` with a `Co-Authored-By: Claude` trailer, based on current `upstream/main`.
