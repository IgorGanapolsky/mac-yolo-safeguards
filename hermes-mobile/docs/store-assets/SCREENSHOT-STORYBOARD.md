# Screenshot storyboard — Hermes Mobile

Canonical spec: [STORE-ASO-JULY-2026.md](../STORE-ASO-JULY-2026.md) §2. Monetization wedge: [MONETIZATION-PROMOTION.md](../MONETIZATION-PROMOTION.md).

## Capture commands

```bash
cd hermes-mobile
HERMES_ANDROID_DEVICE=R3CY90QPM7E bash scripts/capture-store-screenshots.sh
# Framed multi-device exports (caption bands baked in):
bash scripts/generate-store-screenshots.sh
```

## Frame spec (aligned with `fastlane/screenshots/en-US/`)

| # | Deep link / screen | Caption (≤7 words) | Base file stem |
|---|--------------------|-------------------|----------------|
| 1 | `hermes://chat` (Connected) | Approve AI agents from phone | `01_approve` |
| 2 | `hermes://leash/preview/smoke` | Block destructive commands remotely | `02_block` |
| 3 | Settings → Safeguard / pair | Standing gate rules synced | `03_standing` |
| 4 | `hermes://settings?pair=qr` | Pair your Mac in one scan | `04_pair` |
| 5 | Leash → ThumbGate options | ThumbGate memory on replies | `05_thumbgate` |
| 6 | Settings (top) | Settings for your Mac link | `06_works` |

**ASC upload rule:** emit **only** `_67` (+ `ipad129` for first 3). Do **not** also ship `_65` into `fastlane/screenshots/` — Apple folds both into `APP_IPHONE_67` and the carousel shows exact duplicates (2026-07-13 incident).

**Uniqueness gate:** `python3 scripts/_assert_store_frame_distinct.py fastlane/store-capture/raw` — every pair &lt; 90% similar.

## Caption band (all frames)

- Top panel: 120px, `#111827`
- Headline: Space Grotesk or Inter Bold, 48px, `#F3F4F6`
- Accent keyword: `#22D3EE`
- Device frame: centered, 92% width, 8px `#374151` border, 24px radius

## Squint test

Export at 200px width. If caption unreadable → increase font to 56px or shorten copy.
