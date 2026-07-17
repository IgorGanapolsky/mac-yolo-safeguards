# 7-day store plan — DO-NOW execution (2026-07-14 ~04:35Z)

## Results (evidence-only)

### 1) 22s video → YouTube unlisted → Play / ASC
| Item | Status |
|------|--------|
| Source MP4 | ✅ `docs/store-assets/hermes-play-promo-16x9-22s.mp4` (~23.6s, 1920×1080, 787KB) |
| Copy on Desktop | ✅ `~/Desktop/hermes-play-promo-16x9-22s.mp4` (for file picker) |
| App Preview MP4 | ✅ `fastlane/app_previews/en-US/IPHONE_67_preview.mp4` |
| **6 distinct screenshots** | ✅ **Play API commit `08763681722737263122`** — sha256 matches local `01_approve`…`06_works`; distinctness audit pass |
| **Feature graphic** | ✅ Same API edit |
| YouTube unlisted upload | ❌ **Not completed** — Studio open (`UC75jQv83ldY95t5FEGalCqQ`); ADC YouTube scopes **blocked by Google**; file-picker automation blocked |
| Play promo video field | ❌ empty (API listings has no video URL) |
| ASC App Preview attach | ❌ ASC inflight open in Chrome; Media Manager not automated this session |

**Manual 60s finish (only remaining for video):** YouTube Studio → Select files → Desktop `hermes-play-promo-16x9-22s.mp4` → Visibility **Unlisted** → Publish → copy URL → Play Console → Main store listing → Promo video → paste URL. ASC → iOS version media → App Preview → `IPHONE_67_preview.mp4`.

### 2) Hybrid C short description
| Layer | Value |
|-------|--------|
| **Play API production (en-US)** | ✅ `Your Mac, not cloud credits. Leash Pro $19.99 — approve AI from phone.` (verified + re-committed 2026-07-14 via `hermes-mobile-publisher@hermes-mobile-play`) |
| **Public storefront HTML** | ⚠️ still shows `Steer Claude Code, Cursor & Codex from phone. Approve tools.` in og:description (CDN lag); full description already includes own-machine / cloud credits language |
| **Repo fastlane metadata** | ✅ matches hybrid C |

### 3) HN / Reddit Var C
| Item | Status |
|------|--------|
| Draft + UTM | ✅ `docs/social/ready-to-post/11-var-c-hn-reddit-7day.md`, `12-var-c-selfhosted-day4.md`, `13-var-c-sideproject-day4.md` |
| HN post | ❌ Skipped — dead post `48898789`, karma 3, prior rate limit |
| **r/SideProject** | ✅ https://www.reddit.com/r/SideProject/comments/1uvyqhz/ — live 2026-07-14 |
| r/selfhosted | ⚠️ Submit clicked; no post URL (likely megathread rule) |

### 4) First 5 reviews
| Item | Status |
|------|--------|
| Public reviews | ❌ 0 (no rating surface) |
| In-app prompt | ✅ code path exists; threshold=**5** approvals (`storeReview.ts`, 2026-07-14) |
| Traffic to trigger reviews | ⚠️ r/SideProject posted; awaiting installs |

### 5) Store Listing Experiment A vs C
| Item | Status |
|------|--------|
| Runbook | ✅ `docs/store-assets/EXPERIMENT-A-vs-C-2026-07-14.md` |
| Console experiment created | ❌ not started (Console UI only; no Publisher API) |
| Metric | First-time installers retained, ≥7 days |

## What “do it now” completed without human

1. Verified hybrid C **is** production short desc via Android Publisher API + committed edit.  
2. Confirmed 22s assets on disk + Desktop.  
3. Opened YouTube Studio + Play Console in logged-in Chrome.  
4. Wrote Var C traffic pack + experiment runbook + this log.  
5. Did **not** invent installs/reviews or paid ads.

## Blockers that cannot be forced from this agent environment

- Google **blocked** gcloud OAuth client for YouTube upload scopes.  
- File-picker upload needs a real user gesture on the correct Space (Screen Sharing / multi-desktop desync).  
- Store Listing Experiments + ASC media attach are Console/ASC UI only.  
- HN rate-limit `story-toofast`.

