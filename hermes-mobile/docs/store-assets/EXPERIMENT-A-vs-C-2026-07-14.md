# Play Store Listing Experiment — Short desc A vs C (2026-07-14)

## Status
**Not started in Console** — requires Play Console UI (API does not create Store Listing Experiments).

**2026-07-14 attempt:** Navigated to `main-store-listing` and `store-listing-experiments` — Console returned error **5E2B699C** / redirected to app-list. Retry when Console stable; hybrid C already production default via API.

## Setup (Play Console → Grow → Store listing experiments)

| Field | Value |
|-------|-------|
| Variable | **Short description only** (one variable) |
| Control (A) | `Approve AI agent tools from your phone. Stop runaway scripts on your Mac.` |
| Treatment (C hybrid) | `Your Mac, not cloud credits. Leash Pro $19.99 — approve AI from phone.` |
| Audience | 50/50 default |
| Duration | **≥7 days** |
| Primary metric | **First-time installers retained** |
| Do not | Change screenshots in same experiment |

## Screenshot experiment (queue after short-desc, or separate if Console allows)

| Control | Treatment |
|---------|-----------|
| Pre-July-11 frames if archived | Fixed 01/05 (distinct story, no dogfood) from `fastlane/screenshots` |

## Measurement
- Daily: Play Console experiment detail → retained first-time installers
- Abort if traffic too low for significance after 7d — document inconclusive, keep hybrid C as default (already production via API)

## Video dependency
Paste unlisted YouTube URL into main listing **before** or **independent of** experiment (video not A/B'd in short-desc test).
