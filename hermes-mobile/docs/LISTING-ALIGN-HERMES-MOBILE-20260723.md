# Listing align — Hermes Mobile family (2026-07-23)

## Why Play vs App Store looked different / underwhelming

| Cause | Evidence |
|-------|----------|
| **Two Play packages** | Free `com.iganapolsky.hermesmobile` vs paid `com.iganapolsky.hermesmobile.paid` had divergent titles (`Hermes AI: … Leash` vs `Hermes Mobile: AI Agent`) |
| **Separate metadata pipelines** | Play via `push-play-listing.py` / supply; iOS via ASC API + `fastlane deliver` — not one shared “public name” |
| **Title divergence** | Live iOS `Hermes AI Agent Leash` (+ web “App” chrome); Play paid already `Hermes Mobile: AI Agent` |
| **Screenshot drift** | Framed assets still showed mega-token banners, `typeable-probe`, Tailscale IPs, Railway ThumbGate fields, `/Users/igor…` paths — dogfood/debug as hero |
| **ASC public gallery empty** | `itunes.apple.com/lookup?id=6786778037` returned `screenshotUrls: []` for v1.3 while Connect/web sometimes still showed stale frames |

## Aligned public copy (this change)

| Field | Value | Limit |
|-------|-------|-------|
| Play title + iOS name | `Hermes Mobile: AI Agent` | ≤30 |
| iOS subtitle | `Chat & approve Mac tools` | ≤30 |
| Play short | `Hermes Mobile: chat & approve Mac tools. Pay once. Not phone AI.` | ≤80 |
| iOS keywords | `remote,coding,devtools,leash,…` (no overlap with name/subtitle) | ≤100 |

## Screenshots

- Scrubbed ban phrases via `scripts/sanitize-store-raw-frames.py` (OCR box cover on real UI).
- Regenerated framed Play + iPhone 6.7" + iPad 12.9" via `generate-store-screenshots.py`.
- Captions: Control your Mac / Approve risky tools / Standing safety rules / Pair / ThumbGate / Cellular.

## Push status

- Play API `--package both`: committed (free + paid) with aligned title/short/full + 6 phone screenshots.
- ASC rename follow-up (`cursor-asc-rename-ship`, 2026-07-23):
  - **Attempted live** `READY_FOR_SALE` appInfoLocalization PATCH for name+subtitle → **ASC 409** `ENTITY_ERROR.ATTRIBUTE.INVALID.INVALID_STATE` (“The field 'name' can not be modified in the current state.”). Same for subtitle.
  - **Already staged** on iOS **1.4** `WAITING_FOR_REVIEW` appInfo: name `Hermes Mobile: AI Agent`, subtitle `Chat & approve Mac tools`, keywords match repo `fastlane/metadata/ios/en-US/`.
  - Proof artifact: [`docs/ASC-RENAME-HERMES-MOBILE-20260723.md`](./ASC-RENAME-HERMES-MOBILE-20260723.md) (local JSON under gitignored `docs/proofs/` also captured).
  - **No Expo OTA** (metadata/version gate, not JS).
- Repo `fastlane/metadata/{ios,android}/en-US/name|title.txt` already = `Hermes Mobile: AI Agent` (contract in `storeListingMetadataContract.test.ts`).

## Honesty — when users see the new iOS name

| Surface | Name today | When it becomes `Hermes Mobile: AI Agent` |
|---------|------------|-------------------------------------------|
| Public iTunes / App Store (v1.3 live) | `Hermes AI Agent Leash` | After **1.4** is **Approved** and auto-released (`releaseType: AFTER_APPROVAL`). **Not metadata-only** on the live listing — Apple locks name/subtitle on `READY_FOR_SALE` appInfo while that version is live; the editable copy rides the next binary version already in review. |
| ASC 1.4 (in review) | Already renamed | Reviewers / Connect UI for that version |
| Google Play | Already `Hermes Mobile: AI Agent` | Now |
| Exact-title iTunes search | Still ranks old trackName (#3 under similar queries) | Expect #1 for exact `Hermes Mobile: AI Agent` **after** 1.4 goes live (index lag possible) |
| Broad `hermes ai` SERP | Competitors own top slots | May stay buried even after rename — install/rating velocity, not title alone |

## "hermes mobile" SERP (2026-07-23 — Igor fury)

- iTunes US: **ours #74** as `Hermes AI Agent Leash`; **#1 = logistics truck app** literally named **Hermes Mobile** (`ch.dataphone.Hermes`).
- First screen = Hermex / truck Hermes Mobile / HermesPilot / Atomic Hermes — matches screenshot.
- **Live name still 409-locked.** Staged on 1.4. **Live promo patched** to lead with `Hermes Mobile:` (does not replace title ranking).
- Public first-screen for “hermes mobile” only after **1.4 Approved + release**. Truck app may still rank above us on that exact phrase.

## Still blocked / follow-ups

- Phone was offline the scrub session — privacy cover of existing captures, not a fresh demo recapture. Re-run `capture-store-screenshots.sh` when device is available for pristine UI.
- Do **not** invent a second store binary just for the rename: 1.4 already carries it.
- Honest ranking: 0+ installs still dominate discoverability; listing polish helps conversion, not overnight SERP #1 for head terms.
