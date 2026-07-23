# ASO Hermes AI SERP — 2026-07-21

Agent: `cursor-aso-hermes-ai-serp` · coord `c79e69ff`

## Verdict

| Check | Result |
|-------|--------|
| Free public URL | **HTTP 200** `https://play.google.com/store/apps/details?id=com.iganapolsky.hermesmobile` |
| Free deep link on phone | **Live** — Play shows IgorGanapolsky listing with Uninstall/Open (vc18 / production completed) |
| Publisher API title (committed) | **`Hermes AI: Mac Agent Leash`** (26/30) |
| Public `og:title` / Play client title | Still **`Hermes AI Agent Leash`** — **CDN/index lag** (API ahead of public cache) |
| Paid `.paid` public URL | **HTTP 404** — left alone (in review / unpublished) |
| Organic SERP `Hermes AI` | **Missing / not top** — Hen Works `Hermes Agent - Android` #1 (4.4★, 10K+) |
| Organic SERP `Hermes Mobile` | **Not in top visible rows** — sponsored + Jobber/Blossom + Hen Works + Hermes-V Mobile |
| Igor's screenshot | Search `Hermes ai` + **This device** chip → Picsart/Adobe/FaceApp promo rail (not our miss on deep link) |

## What we shipped this turn

- Play Publisher API `listings.update` + `edits.commit` on free package:
  - title → `Hermes AI: Mac Agent Leash`
  - short kept: `Hermes AI agent leash for Mac — chat & approve tools. $4.99 once. Not phone AI.`
- Repo SoT: `fastlane/metadata/android/en-US/title.txt` + contract test assert
- Did **not** touch T-SUBTITLE-PAID-ONCE short/full ownership beyond re-commit of already-live short/full with title edit
- Did **not** change paid review state

## Honest ranking / lag

- Title containing **Hermes AI** was already live before this turn (`Hermes AI Agent Leash`); we made it more aggressive with **Mac** differentiator.
- Google Play search ranking for contested head terms is install/review velocity dominated. Copy alone will not displace Hen Works (10K+ downloads) on `Hermes AI`.
- Public storefront string can lag Publisher API by minutes–hours (observed: API `Hermes AI: Mac Agent Leash`, `og:title` still previous).
- Long-tail still the winnable lane historically: `ai agent leash`, `hermes leash`.

## Phone artifacts

- Deep link live listing: `play-store-listing-20260721-105630.png`, `play-listing-title-proof-20260721-110132.png`
- SERP Hermes AI (Hen Works #1): `play-serp-hermes-ai-nofilter-20260721-105727.png`, `play-serp-hermes-ai-cleared-105847.png`
- SERP Hermes Mobile (ours absent top): `play-serp-hermes-mobile-105909.png`

## Coordination

- Released claim after merge; paid remains other agents' review lane.
