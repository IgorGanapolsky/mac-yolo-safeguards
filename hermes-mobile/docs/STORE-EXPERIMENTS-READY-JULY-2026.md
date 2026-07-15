# Store experiments ready (July 2026)

**Purpose:** Stellar 2026 = testable conversion system. Creative is live; experiments start when there is enough traffic for significance.

**Do not claim experiments are running until Console shows an active experiment ID.**

## Status (2026-07-15)

## LIVE Console proof — 2026-07-15T16:21:22Z

| Item | Evidence |
|------|----------|
| **Store listing experiment** | **In progress:** `Short desc A vs hybrid C` · Default store listing · Translated (en-US) · Start **Jul 14, 2026** · 1 variant · 50% of users |
| **Max experiments** | Console banner: "You've reached the maximum allowed experiments" — cannot create another until active/draft cleared |
| **Default listing** | Live + **Changes in review** (Jul 15, 2026) — full description, phone screenshots, icon, feature graphic, video |
| **Publishing overview** | "Your changes are now in review" · Managed publishing **off** · Last published Jul 14, 2026 |
| **CSL** | 0 custom listings; Create available — deferred while default listing changes in review (avoid conflicting drafts) |
| **ASC PPO** | Not created — needs traffic + App Analytics; live subtitle locked until v1.1 (ASC 409). Promo text patched on READY_FOR_SALE |
| **Play API** | androidpublisher v3 has **no** experiments/CSL methods — Console-only |

Console URLs (IgorGanapolsky developer `5120393192891708058`, app `4973118708450369499`):
- Experiments: `/store-listing-experiments/overview`
- Listings: `/store-listings`
- Publishing: `/publishing`



| Surface | Status | Blocker |
|---------|--------|---------|
| Play default listing | **Live** — hybrid C short, iOS-live FAQ, 6 screenshots, trailer | Traffic |
| Play Store Listing Experiment (SLE) | **Ready to create** — variants in `fastlane/metadata/android/en-US/variants/` | Need installs for 7-day retained first-time installers metric |
| Play Custom Store Listings (CSL) | **Ready to create** — same variant pack | Keyword/campaign targets |
| App Store Product Page Optimization (PPO) | **Ready after traffic** — subtitle/keyword variants in `fastlane/metadata/ios/en-US/variants/` | 0 ratings; live subtitle change needs v1.1 build |
| ASC live promotionalText | **Patched** 2026-07-15 | — |
| ASC live subtitle | **Draft only on v1.1** (`Control Mac agents from phone`); live 1.0 still `Approve Claude Code, Cursor` | Attach build to 1.1 + submit |

## First experiment (Play) — create when installs > 0

1. Play Console → Grow → Store presence → **Store listing experiments**
2. Variable: **Short description** only
3. Control: current hybrid C  
   `Your Mac, not cloud credits. Leash Pro $19.99 — approve AI from phone.`
4. Treatment: variant A safety  
   (file: `variants/short_description_A_safety.txt`)
5. Duration: ≥7 days  
6. Primary metric: **First-time installers retained**
7. Record experiment ID in `docs/proofs/store-experiments/`

## First experiment (iOS PPO) — after v1.1 live subtitle

1. App Store Connect → Hermes Mobile → **Product Page Optimization**
2. Treatment: subtitle + screenshots from variant B or C
3. Metric: product page conversion rate  
4. Apple does **not** A/B full description via PPO

## Review prompt

- In-app: `STORE_REVIEW_THRESHOLD = 1` (first Leash approval)
- Still needs **real users** — zero installs ⇒ zero prompts ⇒ zero reviews

## Push / verify commands

```bash
# Play (text + screenshots + feature graphic + icon)
python3 hermes-mobile/scripts/push-play-listing.py

# ASC editable fields (promo on READY_FOR_SALE; full copy on PREPARE_FOR_SUBMISSION)
node hermes-mobile/scripts/push-asc-listing-copy.js

# Verify
node hermes-mobile/scripts/verify-asc-listing.js --json
```
