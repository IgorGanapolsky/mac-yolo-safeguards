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

| # | Deep link | Caption (≤7 words) | Base file stem |
|---|-----------|-------------------|----------------|
| 1 | `hermes://chat` | Approve AI agents from phone | `01_approve` |
| 2 | `hermes://leash` | Block destructive commands remotely | `02_block` |
| 3 | `hermes://leash` (Pro unlocked) | Standing gate rules synced | `03_standing` |
| 4 | `hermes://settings` | Pair your Mac in one scan | `04_pair` |
| 5 | Chat + thumb tap | ThumbGate memory on replies | `05_thumbgate` |
| 6 | Connection panel (cellular) | Works on cellular + tunnel | `06_works` |

**Device suffixes:** `_65` (6.5"), `_67` (6.7"), `_ipad129` (12.9" iPad where applicable).

## Caption band (all frames)

- Top panel: 120px, `#111827`
- Headline: Space Grotesk or Inter Bold, 48px, `#F3F4F6`
- Accent keyword: `#22D3EE`
- Device frame: centered, 92% width, 8px `#374151` border, 24px radius

## Squint test

Export at 200px width. If caption unreadable → increase font to 56px or shorten copy.
