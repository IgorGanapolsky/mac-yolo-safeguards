# Store listing A/B variants

Research: [STORE-ASO-JULY-2026.md](../../../docs/STORE-ASO-JULY-2026.md) §6.

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
cd hermes-mobile && bundle exec fastlane supply --skip_upload_apk --skip_upload_aab
```

Default shipped copy = **Variant A** in parent `en-US/` folders.
