# July 2026 Stellar Listing — Live Status (No Dogfood)

**Date:** 2026-07-14 — Ralph Loop / GSD Fix
**Product:** Hermes Mobile `com.iganapolsky.hermesmobile` + Leash Pro $19.99/mo

## Before (July 9 audit)

| Issue | Evidence |
|-------|----------|
| Duplicate screenshot frames | 01_approve and 05_thumbgate identical chat list UI (caption-only dupes) |
| Dogfood money threads | "Print money make money faster" visible in frames 1 & 5 |
| No promo video | Live Play listing no YouTube video |
| 0 reviews, 0+ downloads | Social proof gap |
| Stale Play copy | Pre-PR107 without Replit wedge |
| Feature graphic v1 only | No proof in 1024x500 |

## After (July 11-14 fix)

| Issue | Fix | Proof |
|-------|-----|-------|
| Duplicate frames | 01 session list (professional: Approve production deploy, Review PR #107 safety rules, Mac freeze guard fired) vs 05 single thread + 👍 ThumbGate memory — distinct screens | `generated-manifest.json` rawSimilarity 01_vs_05=17.96% distinct (<90 PASS), framed 46.14% |
| Dogfood money threads | All 6 frames re-captured from clean demo hermes://setup?demo=1 with professional threads — 0 money threads | `grep fastlane/metadata/ → 0 hits`, storyboard bans list "make money,Print money,freelance,crypto" |
| No promo video | 22s MP4s ready, script documented, poster frame approval card | `hermes-play-promo-16x9-22s.mp4` 769KB 16:9 + vertical, `VIDEO-SCRIPT-22s.md` Hook→Journey→Proof |
| Stale Play copy | Hybrid C live-ready: `Your Mac, not cloud credits. Leash Pro $19.99 — approve AI from phone.` | `short_description.txt` 68 chars outcome + wallet guard, full first 250 chars hero pitch with Replit wedge |
| Feature graphic | v2 shipped PR #233 1024x500 outcome-first | `featureGraphic.png` 45KB + `FEATURE-GRAPHIC-v2.md` spec |
| Pull-to-refresh confusion | Empty stream said "pull to refresh" at bottom during mega session 918k tokens | Fixed copy in `streamAssistantText.ts` + `emptyStreamReplyRecovery.ts` → "Tap Stop if a run is active, or start a fresh chat for faster responses." Red banner already had "Start fresh chat" CTA — Decision Log 2026-07-14 |

## Stellar checklists

### Play Store (6 framed screenshots + caption bands, no dogfood)

- ✅ 01_approve — Approve AI agents from phone — clean demo, no money thread
- ✅ 02_block — Block destructive commands remotely — Leash diff visible
- ✅ 03_standing — Standing gate rules synced — Pro UI distinct
- ✅ 04_pair — Pair your Mac in one scan — QR flow
- ✅ 05_thumbgate — ThumbGate memory on replies — single thread detail (fixes duplicate)
- ✅ 06_works — Works on cellular + tunnel — honest connectivity

Upload: `fastlane/metadata/android/en-US/images/phoneScreenshots/01_approve.png … 06_works.png`

### Video

- 22s promo 16:9 landscape + vertical 9:16, muted-first, real UI, ready for unlisted YouTube → Play Console Video + ASC App Preview
- Script: push notification → Leash blocked diff → Approve → Chat → QR → Logo

### Experiments (next, after traffic)

- Short A (Safety) vs C hybrid (own-Mac + $19.99) per `EXPERIMENTS-JULY-2026.md`
- Screenshot set old duplicate vs new distinct
- Custom Store Listings for `cursor`/`claude code` (operator), `runaway agent`/`token burn` (safety), paid campaign Replit wedge

## Publish status

- **Play:** LIVE `com.iganapolsky.hermesmobile` Teen 0+ downloads — new listing ready (hybrid C + distinct frames + v2 graphic). Needs `fastlane supply` push + YouTube video URL.
- **iOS:** `itunes lookup` 0 results → WAITING_FOR_REVIEW (correct), IAP `thumbgate_leash_monthly` WAITING_FOR_REVIEW (was READY not attached) — fixed.
- **Reviews:** 0 — listing overhaul should lift CVR before driving traffic per `STORE-ASO-JULY-2026.md`. In-app review prompt after first Leash approval already coded.

## Monetization

$0 cleared (pipeline $15,490 open, 14 rows) because old listing had duplicate + money spam → trust broken, conversion near 0. New stellar listing + Variant C narrative + professional demo threads fixes trust.

