# ASO search gap — "hermes ai" (2026-07-20, title pass)

## Verdict

| Store | Direct URL live? | Organic "hermes ai"? | Notes |
|-------|------------------|----------------------|-------|
| **Google Play** free `com.iganapolsky.hermesmobile` | **Yes** | Still contested (Hen Works #1) | **Title shipped** → `Hermes AI Agent Leash` via Play API edit commit |
| **iOS App Store** id `6786778037` | **Yes** — **$9.99** 1.2 READY_FOR_SALE | Still contested (Hermes AI Personal Agent #1) | **1.3 WAITING_FOR_REVIEW** name/subtitle/keywords shipped; live 1.2 name locked (409) until 1.3 ships |
| **Play paid** `com.iganapolsky.hermesmobile.paid` | **Not public** | N/A | In review / other agent |

## Direct URLs (proven 2026-07-20)

- Play: https://play.google.com/store/apps/details?id=com.iganapolsky.hermesmobile
- iOS: https://apps.apple.com/us/app/id6786778037

## Metadata shipped this pass (aggressive, accurate)

### Play (API `push-play-listing.py --text-only`, committed)

| Field | Value | Limit |
|-------|-------|-------|
| **Title** | `Hermes AI Agent Leash` | 21/30 |
| **Short** | `Hermes AI agent leash for Mac — chat & approve tools. $4.99 once. Not phone AI.` | 79/80 |
| **Full** | Lead rewritten to open with **Hermes AI Agent Leash (Hermes Mobile)** + keep competitor FAQ | 3897/4000 |

Differentiation vs Hen Works / Hermes-Relay kept in FAQ (no trademark impersonation).

### iOS ASC API (`push-asc-listing-copy.js`)

| Surface | Name | Subtitle | Keywords / promo |
|---------|------|----------|------------------|
| **1.3 WAITING_FOR_REVIEW** | **`Hermes AI Agent Leash`** | **`Hermes AI agent for your Mac`** | keywords 99/100 + `mobile`; promo leads with “Search Hermes AI” |
| **1.2 READY_FOR_SALE** | Locked: `Hermes Mobile: AI Agent Leash` | Locked: `Control Mac agents from phone` | **promotionalText** updated on live |

Custom product pages: **0** via ASC API (`appCustomProductPages` empty). Promo text maxed on live + 1.3 instead of inventing a CPP without assets.

## 1.3 binary status (coord, do not duplicate)

- ASC version **1.3** = **`WAITING_FOR_REVIEW`** (already attached/submitted).
- Open PR #632 (`store/ios-1.3-asc-binary`) is **CONFLICTING** and largely obsolete for binary attach — metadata for ranking is already on the waiting version.
- Live public iTunes lookup still shows **1.2** name until Apple releases 1.3.

## Honest ranking

Text/title moves **match + conversion**. Head-term rank for `hermes ai` is still dominated by free apps with reviews/installs (Hen Works 10K+; Hermes AI Personal Agent). Expect **hours–days** of index lag after title change; do not claim #1 without a fresh SERP proof.
