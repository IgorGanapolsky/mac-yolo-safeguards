# Store Listing Experiments + Custom Store Listings — July 2026 Stellar

**Context:** Play live (0+ downloads, 0 reviews) + stellar overhaul July 11 (duplicate frames fixed, dogfood removed, hybrid C copy live-ready, feature graphic v2, 22s video)

**Why experiments now:** Good listing converts, but old listing had duplicate + money spam → conversion near 0. Need data-driven copy + creative tests before paid traffic.

## Play Store Listing Experiments (A/B)

**Tool:** Play Console → Grow → Store presence → Store listing experiments

**Experiment 1 (Day 3-7): Short description Variant A vs C hybrid**
- Control (A Safety): `Approve AI agent tools from your phone. Stop runaway scripts on your Mac.`
- Variant (C Wallet guard): `Your Mac, not cloud credits. Leash Pro $19.99 — approve AI from phone.` **(currently live after July 11 fix)**
- Hypothesis: C wins on Replit-comparison intent + price anchor, A wins on pure safety intent
- Metric: **First-time installers retained** (not raw installs) — Play docs: retention-weighted success 2026
- Duration: ≥7 days, low-traffic app needs 4-6 weeks per AppScreens guidance — do NOT end early
- Proof: Screenshot copy + Play Console experiment ID screenshot

**Experiment 2 (queued after fix): Screenshot set**
- Control: old duplicate set (01 and 05 same chat list)
- Treatment: new 6 distinct frames with caption bands, professional demo threads (no money)
- Metric: CVR + retained installers
- Proof: `generated-manifest.json` rawSimilarity 01_vs_05=17.96% distinct vs >90% duplicate before

## Custom Store Listings (CSL) — up to 50 tailored pages

**Use after stellar base is trustworthy (no dogfood, distinct frames).**

| CSL | Keyword intent | Short copy | Screenshot order |
|-----|----------------|------------|------------------|
| `cursor` / `claude code` | Operator searching dev tools | B: `Control Cursor & Claude Code from your phone. Pair Mac, chat, approve tools.` | 01 approve, 02 block, 03 gate rules |
| `runaway agent` / `token burn` | Wallet + safety aware | C: `Stop token-burn loops and runaway simulators. Approve agent tools from your phone.` | 02 block, 01 approve, 06 cellular |
| Paid campaign UTM | HN/Reddit Variant C | C hybrid | 01 approve, 04 pair, 05 ThumbGate |

**Tool:** Play Console → Custom store listings → Create → target by search keywords / Ads campaign URL

## iOS Product Page Optimization (PPO) + Custom Product Pages (CPP)

- PPO: Test screenshot 1 `Approve from phone` vs `Your Mac not cloud credits` hero — first 3 screenshots dominate conversion per Phiture 2026
- CPP: After PPO winner, deploy winning frame to `cursor` keyword CPP after iOS approval (currently WAITING_FOR_REVIEW, lookup 0 results)

## Metrics to track (from STORE-LISTING-STELLAR-JULY-2026 § Metrics)

- Primary (weekly): Store listing CVR, retained first-time installers, product page CVR iOS, impressions→install
- Secondary: `leash_paywall_view` → `leash_purchase_result` (PostHog), review count + avg rating (goal ≥5 reviews at ≥4.0★ in 14 days), short desc experiment lift, screenshot experiment lift
- Guardrails: Don't optimize for installs if D1 retention drops, don't end experiments before 7 days, log UTM per channel

## Action checklist Day 3-7

| Day | Action | Proof |
|-----|--------|-------|
| Day 3 | Start Play short description A vs C hybrid experiment | Experiment ID in Play Console screenshot |
| Day 4 | HN/Reddit Variant C post with clean demo threads | HN link + UTM, Reddit link + no dogfood threads |
| Day 5 | iOS unblock: confirm Paid apps agreement active, attach IAP to v1.0, update review notes demo path `hermes://setup?demo=1` only | `verify-asc-listing.js` IAP WAITING_FOR_REVIEW |
| Day 6 | CSL for `cursor`/`claude code` + feature graphic v2 ship | CSL live in Play Console, `featureGraphic.png` 1024x500 updated |
| Day 7 | Export Play acquisition + experiment dashboard, capture ThumbGate lesson | CSV + `capture_memory_feedback` |

**Status July 14:** New 6 distinct screenshots (manifest PASS <90%), hybrid C short live-ready, feature graphic v2 shipped PR #233, video script + 22s MP4 ready (needs YouTube unlisted URL), 0 reviews → need first traffic post-launch.
