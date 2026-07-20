# ASO search gap — "hermes ai" (2026-07-20)

## Verdict

| Store | Direct URL live? | Organic "hermes ai"? | Root cause |
|-------|------------------|----------------------|------------|
| **Google Play** free `com.iganapolsky.hermesmobile` | **Yes** — production 1.2 / vc18 `completed` | **No** (top = Hen Works `com.hermesagent.android`) | Contested head term + competitor install/review velocity; 0 public ratings |
| **iOS App Store** id `6786778037` | **Yes** — **$9.99** READY_FOR_SALE | **No** (top = Hermes AI Personal Agent id6759341434 et al.) | Same: brand collision + free competitors with reviews; we have **0 ratings** |
| **Play paid** `com.iganapolsky.hermesmobile.paid` | **Not public** | N/A | Draft / API 403 for this SA — another agent owns T-PLAY-PAID-LIVE |

## Direct URLs that work

- Play: https://play.google.com/store/apps/details?id=com.iganapolsky.hermesmobile
- iOS: https://apps.apple.com/us/app/hermes-mobile-ai-agent-leash/id6786778037

Phone proof (2026-07-20): `market://details?id=com.iganapolsky.hermesmobile` opens live listing (Uninstall/Open — already installed).

## Search evidence (same day)

| Query | Play | iTunes search API |
|-------|------|-------------------|
| `hermes ai` | Ours **absent** from top ids; Hen Works #1 | Ours **absent** from top 24 |
| `hermes mobile` | Ours **#2** (after Hen Works) | Unrelated old "Hermes Mobile" id465082160 #1; ours not top |
| `ai agent leash` | Ours **#1** | Ours **#2** ($9.99) |
| `hermes leash` | Ours **#1** | Ours **#1** |
| `hermes mobile ai agent` | — | Ours **#2** |

**Honest ranking:** We are live and indexed for long-tail / brand+product queries. We do **not** rank for the contested head term `hermes ai` against free apps with 10K+ downloads / reviews. Metadata fixes improve match + conversion; they will not instantly beat Hen Works / Hermes AI Personal Agent on that SERP.

## Metadata shipped this pass

### Play (API `push-play-listing.py --text-only`)

- **Title** (unchanged): `Hermes Mobile: AI Agent Leash` (29/30)
- **Short** → `Hermes AI agent leash: chat & approve Mac tools from your phone.` (64/80)
- **Full** → lead with "Hermes AI agent leash" + "not on-device phone AI"; kept live FAQ / competitor differentiation body

### iOS (ASC `push-asc-listing-copy.js`)

- **Subtitle** → `Hermes AI agent for your Mac` (28/30) — may require PREPARE appInfo / next version if live READY_FOR_SALE blocks subtitle
- **Keywords** → `remote,approve,coding,devtools,gateway,operator,safety,pair,tailscale,desktop,usb,wifi,phone,control` (100/100; no title-word waste)
- **Promotional text** → Hermes AI agent leash / not phone chatbot / pay once / Tailscale (editable on READY_FOR_SALE)

## What will not fix "hermes ai" alone

- Copy-only ASO vs 10K+ install competitors
- Paid draft package until published
- Trademark impersonation of Hen Works / other Hermes AI apps (not done)

## Coordination

`T-SUBTITLE-PAID-ONCE` (in_progress) also owns fastlane listing text. Repo subtitle kept as their AC: `Chat with Hermes on your Mac`. Live App Store subtitle remains `Control Mac agents from phone` until next version; ASC 409 blocks live subtitle/keywords. This turn shipped Play short/full via API + ASC promotionalText on live 1.2; 1.3 PREPARE has ASO keywords/description (and may still show an interim subtitle until that agent lands).
