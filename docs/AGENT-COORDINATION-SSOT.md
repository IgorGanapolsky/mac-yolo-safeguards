# Agent Coordination SSoT — Phase 1

`tools/coordctl.js` is the first executable coordination source of truth shared by every linked worktree. It does not replace `plan.md` yet and it does not contact Linear or Obsidian. Phase 1 makes the unsafe part measurable and atomic before any migration.

## Why it exists

Git worktrees have different working directories and `.git` files, so a lock stored inside a checkout is not a shared lock. `coordctl` resolves `git rev-parse --git-common-dir` and stores state below the common Git directory. Every worktree of the repository therefore contends on the same atomic lock and state file. `COORDCTL_STATE_ROOT` or `--state-root` provides an explicit shared root for a future cross-host deployment.

Source-file claims and runtime singletons have different expiry semantics:

- `source`: expiry is visible but fail-closed. A second actor cannot silently take over possibly uncommitted work; the owner must release it.
- `singleton`: expiry allows takeover. A dead indexer or scheduled worker must not block the fleet forever.

Paths are repository-relative and normalized. Equal, ancestor, and descendant claims conflict, so a claim on `tools` blocks `tools/coordctl.js`; a root file such as `plan.md` is covered exactly. Absolute paths, traversal, and `.git` paths are rejected.

## Commands

```bash
node tools/coordctl.js doctor
node tools/coordctl.js snapshot
node tools/coordctl.js claim --kind source --path tools/example.js \
  --actor codex-example --op-id task-123-claim --ttl 300
node tools/coordctl.js renew --claim-id CLAIM_ID \
  --actor codex-example --op-id task-123-renew-1 --ttl 300
node tools/coordctl.js release --claim-id CLAIM_ID \
  --actor codex-example --op-id task-123-release
```

`doctor` and `snapshot` are read-only: when no store exists, they report `initialized: false` and create nothing. Claim, renew, and release take the atomic store lock, write a temporary state file, then rename it into place.

Every mutation requires a caller-generated operation ID. Repeating the same ID and payload returns the prior result; reusing an ID with a different payload fails. This makes retries safe after a lost response.

## Receipts and verification

Accepted mutations return an HMAC-SHA256 receipt. The signing key is generated once under the central state root with mode `0600` and is never printed. The signed payload binds:

- repository identity (credential-stripped origin hash),
- branch,
- actor,
- normalized paths,
- claim kind and ID,
- state revision and timestamps.

Consumers can verify a saved receipt and changed-file coverage:

```bash
node tools/coordctl.js verify-receipt --receipt /path/to/receipt.json \
  --actor codex-example --changed-file tools/example.js
```

A later CI phase can require this proof without scraping prose from `plan.md`. Phase 1 intentionally does not wire that gate yet.

## What can go wrong, and how it is measured

| Failure | Control | Measurement |
|---|---|---|
| Two worktrees claim the same source | Atomic `mkdir` lock plus overlap exclusion | 50 simultaneous processes, exactly one accepted |
| Retry creates a second claim | Operation fingerprint and replay ledger | Same operation returns the same claim ID |
| Agent claims `src` while another claims `src/a.js` | Equal/ancestor/descendant comparison | Normalization and overlap tests |
| Dead source owner is silently overwritten | Stale source claims fail closed | Stale-source policy test and doctor count |
| Dead runtime blocks forever | Stale singleton is removed inside the next atomic claim | Singleton takeover test |
| Receipt is moved to another branch or actor | Signed binding fields | Tamper and binding tests |
| Root-level edits bypass directory assumptions | Exact repository-relative coverage | `plan.md` coverage test |
| Doctor changes the system it inspects | No directory/key creation in read-only commands | Uninitialized read-only test |

Run the focused proof with:

```bash
node --test tests/test-coordctl.js
```

## Phase boundary

This phase deliberately does not mutate Linear, Obsidian, `plan.md`, CI, or the existing lease/parser implementations. A later migration should dual-read first, compare divergence metrics, then add one fail-closed CI consumer before making this store authoritative.
