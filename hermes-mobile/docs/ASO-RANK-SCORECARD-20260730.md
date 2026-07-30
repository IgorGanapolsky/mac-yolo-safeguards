# ASO rank scorecard — 2026-07-30

Live, signed-out US capture. Not personalized. Ranks move; re-run before any #1 claim.

## Live listings

| Store | Package / ID | Public title | Price | Ratings |
|-------|--------------|--------------|-------|---------|
| Play | `com.iganapolsky.hermesmobile.paid` | Hermes Mobile: AI Agent Leash | $4.99 | low / none public |
| Play free | `com.iganapolsky.hermesmobile` | **404** | — | not a surface |
| iOS | `com.iganapolsky.hermesmobile` (6786778037) | **Hermes AI Agent Leash** (live 1.3) | $4.99 | **0** |
| iOS staged | appInfo WAITING_FOR_REVIEW (1.4) | Hermes Mobile: AI Agent Leash | — | ships with 1.4 |

**Name drift:** public iOS still says `Hermes AI Agent Leash`; Play + 1.4 staged say `Hermes Mobile: AI Agent Leash`.

## Portfolio (finite)

| Ring | Query | iOS | Play | Action |
|------|-------|-----|------|--------|
| CORE | Hermes AI Agent Leash | **#1** | **#1** | DEFEND |
| CORE | AI Agent Leash | **#1** | **#1** | DEFEND |
| CORE | Hermes Leash | **#1** | **#1** | DEFEND |
| CORE | Hermes Mobile | — | **#4** | velocity only (not title thrash) |
| CORE | Hermes AI Agent | **#10** | — | velocity |
| CORE | Hermes Agent | — | — | **do not buy head ads alone** (Nous/Hermex) |
| CORE | Hermes AI | — | — | **do not buy head ads alone** |
| CORE | Hermes Remote | — | — | **SKIP** (TV remote intent) |
| ADJ | agent leash | **#1** | **#1** | DEFEND |
| ADJ | Hermes Mobile AI | **#13** | **#1** | DEFEND Play |
| ADJ | Mac AI agent | — | **#2** | PUSH Play |
| ADJ | control Mac AI agent | — | **#3** | PUSH Play |
| ADJ | remote AI agent | — | **#4** | PUSH Play |
| ADJ | Hermes gateway | **#13** | **#9** | PUSH |
| TAIL | Mac AI agent leash | **#10** | **#1** | DEFEND Play |
| TAIL | Hermes on Mac phone | — | **#5** | PUSH Play |
| TAIL | phone control Hermes | — | **#8** | PUSH Play |
| ADJ/TAIL | Claude Code mobile / Cursor mobile / approve AI tools / most long-tail | — | — | ads + retention only |

## Why head terms lose (evidence)

1. **0 iOS ratings** — contested “Hermes *” SERPs are install/review dominated.
2. **Paid $4.99** vs free Hermes Agent / Hermex / chatbots on the same SERP.
3. **Brand collision** — Nous Hermes Agent, Hermex, Hermes AI Personal Agent, Hermes Relay, DATAPHONE Hermes Mobile.
4. **Wrong intent** — “Hermes Remote” → TV remotes.
5. **Exact product name already wins** — leash family is owned; metadata thrash won’t flip “Hermes AI”.

## Actions taken 2026-07-30

### iOS keywords (1.4 WAITING_FOR_REVIEW) — shipped via ASC API

| | Before | After |
|---|--------|-------|
| Field | `remote,coding,assistant,desktop,control,linux,windows,selfhosted,local,computer,developer` | `remote,coding,desktop,gateway,operator,devtools,tailscale,usb,wifi,phone,pair,linux,windows,safety` |
| Why | Wasted title-overlapping / low-intent slots | Tokens for gateway/Tailscale/USB/Wi‑Fi/operator intent; no repeat of title words once 1.4 renames to *Hermes Mobile: AI Agent Leash* |

Live 1.3 READY_FOR_SALE keywords stay locked (Apple only allows promo text on live).

Repo SoT: `fastlane/metadata/ios/en-US/keywords.txt`.

### Not done (correctly)

- No title rewrite for “Hermes AI” / “Hermes Agent” head terms.
- No Play free republish.
- No claim that keywords alone will create top-10 on head terms.

## 7 / 30 day operating plan

| Horizon | Do | Do not |
|---------|----|--------|
| **This week** | Keep exact #1; fix connect UX before any paid install ads; ship 1.4 when approved (name → Hermes Mobile) | Rename again for SERP vanity |
| **30 days** | ASA/Play ads on DEFEND + Play TOP5 job terms only; review prompt after successful remote action | Buy “Hermes AI” / “Hermes Agent” alone |
| **Measurement** | Re-run this scorecard weekly; Play Console search terms when available | Single personalized phone screenshot as “we rank” |

## Method

- iOS: `https://itunes.apple.com/search?term=…&country=us&entity=software&limit=50` — match seller/bundle `iganapolsky` only.
- Play: public web search HTML package order (signed-out UA); not Console impressions.
- Play listing API: paid title/short confirmed 2026-07-30.
- ASC versions/keywords read + 1.4 patch via App Store Connect API.
