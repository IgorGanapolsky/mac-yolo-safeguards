# Store listing A/B variants

Research: [STORE-ASO-JULY-2026.md](../../docs/STORE-ASO-JULY-2026.md) §6.

## Variants

| ID | Angle | Hypothesis |
|----|-------|------------|
| **A** (default) | Safety circuit breaker | "approve" + "AI" clarity |
| **B** | Remote operator / Codex parity | Higher-volume operator keywords |
| **C** | Wallet + machine guard | Problem-aware ("runaway", "token burn") |

## Files per variant

**Android** (`android/en-US/variants/`):

- `title_{A,B,C}_*.txt`
- `short_description_{A,B,C}_*.txt`
- `full_description_{A,B,C}_*.txt`

**iOS** (`ios/en-US/variants/`):

- `name_{A,B,C}_*.txt`
- `subtitle_{A,B,C}_*.txt`
- `keywords_{A,B,C}_*.txt`
- Full descriptions reuse Android `full_description_*.txt` (same body after opening paragraph)

## How to run experiments

### Google Play — Store Listing Experiments

1. Play Console → Grow → Store presence → **Store listing experiments**
2. Create experiment on **Short description** or **App name** (one variable)
3. Copy text from variant files into control vs treatment
4. Run ≥7 days; metric: **First-time installers retained**

Suggested first test: **Short description A vs C** (safety vs wallet guard).

### Apple — Product Page Optimization

1. App Store Connect → App → **Product Page Optimization**
2. Create treatment with subtitle/keywords from variant B or C
3. Run ≥7 days; metric: **Conversion rate**

Apple does not A/B full description in PPO — only icon, screenshots, and preview video. Use subtitle + keywords variants here.

## Apply variant locally (manual)

```bash
# Example: swap Play short description to variant C
cp fastlane/metadata/android/en-US/variants/short_description_C_wallet_guard.txt \
   fastlane/metadata/android/en-US/short_description.txt
# Preferred (service account, no Gemfile):
python3 scripts/push-play-listing.py
# Or: bundle exec fastlane supply --skip_upload_apk --skip_upload_aab
# ASC editable fields:
node scripts/push-asc-listing-copy.js
```

## Hybrid C wedge (2026-07-09) — active shipped copy

Active `en-US/` short description + iOS subtitle/promo use **Variant C hybrid** (own-Mac + $19.99 vs cloud credits) per [MONETIZATION-PROMOTION.md](../../docs/MONETIZATION-PROMOTION.md). Variant files updated to match for Play/Apple experiments. Full descriptions merge safety + Replit wedge in opening paragraph.

| Field | Hybrid C copy (2026-07-17 Mac-remote wedge) | Limit |
|-------|---------------|-------|
| Play short | `Control YOUR Mac Hermes agent — not phone AI. Approve tools. Leash $19.99.` | 80 |
| iOS subtitle | `Mac remote, not phone chat` | 30 |
| iOS promo | Not the phone-local Hermes Agent… Tailscale/LAN, multi-machine, Leash… | 170 |

Suggested experiment: **Short description A (safety) vs C hybrid (wallet + price)** — 7 days, metric first-time installers retained.
