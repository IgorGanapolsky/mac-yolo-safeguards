# ASC rename evidence — Hermes Mobile: AI Agent (2026-07-23)

Agent: `cursor-asc-rename-ship` · App `6786778037` / `com.iganapolsky.hermesmobile`

## Why "hermes mobile" search does not show us (Igor screenshot + iTunes)

Fresh `itunes.apple.com/search?term=hermes%20mobile&entity=software&country=us&limit=200` (2026-07-23):

| Rank | App | Why it wins |
|------|-----|-------------|
| **#1** | **Hermes Mobile** (`ch.dataphone.Hermes`) | Exact title match + Swiss logistics/truck brand; owns the query |
| #2–4 | Hermex, HermesPilot, Atomic Hermes | Ratings + "Hermes"/"AI Agent" in title |
| **#74** | **Ours** — still titled **Hermes AI Agent Leash** | Name has "Hermes" but **not** "Mobile"; near-zero install signal |

Web App Store first screen matches Igor’s screenshot: truck **Hermes Mobile**, Hermex, HermesPilot, Atomic Hermes — not us.

## Live name cannot flip today

PATCH live `READY_FOR_SALE` appInfoLocalization name → **409**  
`The field 'name' can not be modified in the current state.`

Same for subtitle.

## What IS already staged / just patched

| Surface | State | Name / meta |
|---------|-------|-------------|
| Public iTunes (v1.3) | LIVE | still `Hermes AI Agent Leash` |
| ASC appInfo WAITING_FOR_REVIEW (v1.4) | In queue ~3h+ | **`Hermes Mobile: AI Agent`** + subtitle `Chat & approve Mac tools` |
| Live v1.3 promotionalText | **Patched now** | Starts with `Hermes Mobile:` (READY_FOR_SALE allows promo only) |
| v1.4 keywords + promo | **Patched now** | keywords ≤100 + same promo; name already correct |

v1.4: `WAITING_FOR_REVIEW`, `releaseType: AFTER_APPROVAL`, submitted ~2026-07-23T13:02Z.

## When the user will see us for "hermes mobile"

1. Apple Approves **1.4** and it auto-releases (`AFTER_APPROVAL`).
2. Public `trackName` becomes **Hermes Mobile: AI Agent** (iTunes/App Store index; often minutes–hours after release).
3. Then exact/phrase search should jump far above #74 because title contains **Hermes Mobile**.  
   **Honesty:** the logistics app titled exactly **Hermes Mobile** may still beat us on that exact query (title exact-match + age). We should appear on the first screen once renamed; we will not overnight “own” the query vs the truck app.

**Not available:** metadata-only live rename; Expo OTA; ASC API expedited review (Contact Us only; marketing rename is not a valid expedite reason — do not burn it).

## Repo

`fastlane/metadata/ios/en-US/{name,subtitle,keywords,promotional_text}.txt` aligned to staged 1.4 + live promo patch.
