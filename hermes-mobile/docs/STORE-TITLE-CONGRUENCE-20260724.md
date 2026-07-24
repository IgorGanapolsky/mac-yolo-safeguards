# Store title congruence — 2026-07-24

## Trigger

Igor's screenshot showed the Play **paid** listing (`com.iganapolsky.hermesmobile.paid`)
publicly rendering `ThumbGate: AI Agent for Mac.` — a different product brand — while
Chrome tabs and the live iOS App Store listing (id `6786778037`) showed
`Hermes AI Agent Leash`. Product identity is Hermes Mobile; ThumbGate is the separate
SaaS/RAG brand. Mixing them on the mobile store *title* is a real regression, not ASO.

## Root-cause evidence (Play Developer API vs public storefront)

| Source | Free (`com.iganapolsky.hermesmobile`) | Paid (`...hermesmobile.paid`) |
|---|---|---|
| Play Developer API `edits.listings.get` (authoritative, before this fix) | `Hermes Mobile: AI Agent` | `Hermes Mobile: AI Agent` |
| Public `play.google.com/store/apps/details` (before this fix, `cache-control: no-cache` from origin — not a CDN cache) | 404 (separate pre-existing issue, `T-ASO-LISTING-20260722`, not touched here) | `ThumbGate: AI Agent for Mac` |
| iOS `itunes.apple.com/lookup?id=6786778037` (live, version 1.3) | — | `Hermes AI Agent Leash` |
| Repo `fastlane/metadata/*/title.txt` / `name.txt` (before this fix) | `Hermes Mobile: AI Agent` | `Hermes Mobile: AI Agent` |

**Finding:** PR #850/#864 (`cursor-listing-align`, 2026-07-23) correctly committed
`Hermes Mobile: AI Agent` to the Play API for both packages and to the repo, exactly as
its commit message claims. The public Play storefront simply had not (and, as of writing,
still has not fully) caught up — Google's public store-listing render lagged the API by
roughly one full push cycle (it was still serving the pre-#864 value, `ThumbGate: AI
Agent for Mac`, on the paid package at the time of Igor's screenshot, ~24h after commit).
This is a platform-side propagation/review delay, not a data-loss or config bug — the API
data was never wrong.

Separately, the same PR's commit message says **"iOS 1.4 holds the public rename until
the next native build."** ASC does not let you patch the `name` field on a
`READY_FOR_SALE` (live) version — confirmed 409 lock, `cursor-asc-rename-ship`,
2026-07-23 — so the iOS App Store name stays pinned to whatever shipped with the last
build (`Hermes AI Agent Leash`, version 1.3) until a new native build carries the rename
through a fresh App Store version.

## Decision: fallback canonical name, both platforms, right now

Per Igor's explicit 2026-07-24 directive: prefer `Hermes Mobile` (or `Hermes Mobile: AI
Agent`), but **fall back to `Hermes AI Agent Leash` on both platforms** if a hard limit
forbids the preferred name immediately. The hard limit is real: iOS name is 409-locked on
the live version and there is no local ASC API access in this session (`EXPO_ASC_API_KEY_ISSUER_ID`
lives only in EAS/CI secrets — see `hermes-mobile/scripts/asc-api.js` / the
`hermes-mobile-secrets-and-review-access` skill). Publishing a new iOS binary solely to
rename the app is out of scope (metadata-only fix requested).

**Action taken:** reverted Play free + paid `title.txt`/`paid_title.txt` and the iOS
`name.txt` source-of-truth back to `Hermes AI Agent Leash` (matching the currently-live,
ASC-locked iOS trackName) and re-pushed both Play packages via the Developer API. Updated
`storeListingMetadataContract.test.ts` to assert congruence on this value and to fail if
any of the three ever contains `ThumbGate` again.

## Follow-up (not done here, tracked for the next iOS native build)

When the next iOS native build ships (carrying ASC version 1.4+), re-align all three
(`title.txt`, `paid_title.txt`, `name.txt`) forward to `Hermes Mobile: AI Agent` together,
in one PR, so Android and iOS move in lockstep and never show two different names again.
Do not change Android alone next time without iOS being able to follow immediately.
