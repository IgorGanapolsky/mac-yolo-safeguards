# ASC iOS ASO Positioning — Hermes Mobile (July 2026)

Research date: **2026-07-10**. Bundle: `com.iganapolsky.hermesmobile`. ASC: `WAITING_FOR_REVIEW` v1.0 build 12. Search audit: [hermes mobile (iPhone)](https://apps.apple.com/us/iphone/search?term=hermes%20mobile).

Related: [ASC-IOS-BLOCKERS-JULY-2026.md](./ASC-IOS-BLOCKERS-JULY-2026.md), [STORE-ASO-JULY-2026.md](./STORE-ASO-JULY-2026.md).

---

## Executive summary

| Reality | Implication |
|---------|-------------|
| iOS SERP for "hermes mobile" mixes **Hermex**, **HermesPilot**, luxury/finance noise | Cannot own head term — wedge on **Mac AI Leash**, **approve agents**, **no cloud burn** |
| **Hermes-Relay not on iOS** (Play-only) | iOS competitors are Nous-ecosystem clients, not relay |
| ASC live name still `Hermes Mobile — AI Control` | Repo metadata ahead of ASC — apply post-approval |
| App not searchable (`itunes lookup` → 0) | ASA on brand at launch; long-tail ASO pre-positioned |

---

## iOS search "hermes mobile" — competitor map

| Rank | App | Subtitle | Reviews | Positioning |
|------|-----|----------|---------|-------------|
| 1 | Hermes Mobile (legacy) | Business | — | Unrelated |
| 2 | **Hermex** | A Hermes Agent Client | 38, 4.4★ | Self-hosted Hermes Web UI; no IAP |
| 3 | **HermesPilot** | Tasks, sessions, save tokens | 12, 4.4★ | Hermes Link relay; $9.99 lifetime IAP |
| 4 | Atomic Hermes | AI Agent | 3 | Phone agent + self-hosted tunnel |
| 5 | Aight | OpenClaw & Hermes | 13 | Multi-stack client |
| — | Hermes: AI Daily Brief | Chief of Staff | 8 | Different category |
| — | **Hermes-Relay** | — | **Not on iOS** | Cloud relay — Play only |

---

## Competitive matrix

| Dimension | Hermex / HermesPilot | Hermes Mobile |
|-----------|----------------------|---------------|
| Server | Hermes Web UI (Nous) | **Hermes gateway** on Mac/Linux/Windows |
| Connect | URL or Hermes Link relay | **QR pair** — Wi‑Fi, USB, Tailscale |
| Safety | Session controls | **Leash Pro** — approve/deny blocked tools |
| Monetization | Free / $9.99 lifetime | Free + **Leash Pro $19.99/mo** |
| Stacks | Hermes-only | Cursor, Claude Code, OpenClaw |

**Wedge:** Not a phone AI app — remote control for agents on **your** machine. Skip relay middlemen. Approve risky commands before they run.

---

## iOS ASO factors (July 2026)

| Field | Limit | Weight | Strategy |
|-------|-------|--------|----------|
| Name | 30 | Highest | `Hermes Mobile: Mac AI Leash` — brand + Mac wedge |
| Subtitle | 30 | Second | `Approve agents. No cloud burn.` — no Mac repeat from title |
| Keywords | 100 | Medium | Comma, no spaces; no `hermes`/`mac`/`leash` |
| Promo | 170 | Conversion | Editable anytime while in review |
| Description | 4,000 | Not indexed | Demo mode + Leash truth for reviewers |

Sources: [vmobify iOS 2026](https://vmobify.com/blog/app-store-algorithm-2026/), [LaunchShots title vs subtitle](https://launchshots.app/blog/app-store-title-vs-subtitle), [Nakxi combinatorial indexing](https://www.nakxi.com/blog/how-app-title-and-subtitle-affect-aso-2026/).

---

## Recommended metadata (`fastlane/metadata/ios/en-US/`)

| Field | Value | Chars |
|-------|-------|-------|
| **Name** | `Hermes Mobile: Mac AI Leash` | 27/30 |
| **Subtitle** | `Approve agents. No cloud burn.` | 30/30 |
| **Keywords** | `agent,cursor,claude,code,approve,linux,windows,pair,tailscale,gateway,remote,control,openclaw` | 93/100 |
| **Promo** | `Control Mac AI from your phone — not a cloud IDE. Leash Pro $19.99/mo. Approve risky commands before they run. QR pair any computer.` | 132/170 |

---

## ASC state vs repo (2026-07-10)

`node scripts/verify-asc-listing.js`:

| Item | ASC live | Repo |
|------|----------|------|
| Name | Hermes Mobile — AI Control | Hermes Mobile: Mac AI Leash |
| Subtitle | (in review bundle) | Approve agents. No cloud burn. |
| Version | WAITING_FOR_REVIEW 1.0 | — |
| IAP | thumbgate_leash_monthly WAITING_FOR_REVIEW | Leash Pro $19.99/mo |
| Screenshots | 7×6.7 + 6×6.5 + 3 iPad + 1 preview | — |

### ASC editability while `WAITING_FOR_REVIEW`

| Field | Editable? | Notes |
|-------|-----------|-------|
| Promotional text | **Yes** | Safe via ASC UI/API |
| Description | **Usually yes** | Same version localization |
| Name / subtitle / keywords | **Risky** | Defer full `deliver` until approved/rejected |
| IAP attach | **Blocked** | See ASC-IOS-BLOCKERS |

**Do not run** `scripts/upload-app-store-metadata.sh` (full deliver) while v1.0 is in review.

---

## Ranking expectations

| Timeframe | Outcome |
|-----------|---------|
| Pre-approval | Not rankable; ASA on brand recommended |
| Weeks 2–4 | Long-tail: `mac ai control`, `approve agents phone`, `cursor remote` |
| vs Hermex (38★) | Differentiate Leash + multi-stack in screenshots |
| Not realistic | #1 for bare `hermes mobile` |

Vault handoff: `~/Documents/AI-Agent-Sync/Handoffs/2026-07-10-aso-ios.md`
