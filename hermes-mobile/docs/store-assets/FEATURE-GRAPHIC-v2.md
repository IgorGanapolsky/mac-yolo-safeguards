# Feature graphic v2 — Play Store 1024×500

Canonical spec: [STORE-ASO-JULY-2026.md](../STORE-ASO-JULY-2026.md) §3.

## Layout

```
┌──────────────────────────────────────────────────────────────┐
│  [icon 160px]   Approve AI agents from your phone              │
│                 Stop runaway Cursor / Claude Code tools        │
│                 ★ Free approvals  ·  Leash Pro $19/mo            │
└──────────────────────────────────────────────────────────────┘
```

## Colors

| Token | Hex |
|-------|-----|
| Background | `#0B0F19` |
| Headline | `#F3F4F6` |
| Subhead | `#9CA3AF` |
| Accent | `#22D3EE` |
| Glow (radial, 15% opacity) | `#6366F1` top-left |

## Typography

- Headline: 44px bold sans (Inter or system)
- Subhead: 28px regular
- Footer line: 24px medium, accent color

## Regenerate

```bash
cd hermes-mobile && bash scripts/generate-feature-graphic.sh
```

Output: `fastlane/metadata/android/en-US/images/featureGraphic.png`
