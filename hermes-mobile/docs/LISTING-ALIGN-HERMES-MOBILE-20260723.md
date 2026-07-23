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
- ASC: attempt via `push-asc-listing-copy.js` + screenshot upload workflow/script (see PR notes for issuer/2FA blockers).
- **No Expo OTA** (billing freeze).

## Still blocked / follow-ups

- Phone was offline this session — scrub is privacy cover of existing captures, not a fresh demo recapture. Re-run `capture-store-screenshots.sh` when device is available for pristine UI.
- ASC name/subtitle for READY_FOR_SALE may require a new version localization window; promo text often patches sooner.
- Honest ranking: 0+ installs still dominate discoverability; listing polish helps conversion, not overnight SERP #1.
