# Screenshot storyboard — Hermes Mobile

Canonical spec: [STORE-ASO-JULY-2026.md](../STORE-ASO-JULY-2026.md) §2.

## Capture commands

```bash
cd hermes-mobile
HERMES_ANDROID_DEVICE=R3CY90QPM7E bash scripts/capture-store-screenshots.sh
```

## Frame spec

| # | Deep link | Caption | File name |
|---|-----------|---------|-----------|
| 1 | `hermes://chat` | Approve AI agents from phone | `01_hero_chat.png` |
| 2 | `hermes://leash` | Block destructive commands remotely | `02_leash_approval.png` |
| 3 | `hermes://leash` (Pro unlocked) | Standing gate rules synced | `03_pro_gates.png` |
| 4 | `hermes://settings` | Pair your Mac in one scan | `04_settings_pair.png` |
| 5 | Chat + thumb tap | ThumbGate memory on replies | `05_chat_thumbs.png` |
| 6 | Connection panel (cellular) | Works on cellular + tunnel | `06_cellular_honest.png` |

## Caption band (all frames)

- Top panel: 120px, `#111827`
- Headline: Space Grotesk or Inter Bold, 48px, `#F3F4F6`
- Accent keyword: `#22D3EE`
- Device frame: centered, 92% width, 8px `#374151` border, 24px radius

## Squint test

Export at 200px width. If caption unreadable → increase font to 56px or shorten copy.
