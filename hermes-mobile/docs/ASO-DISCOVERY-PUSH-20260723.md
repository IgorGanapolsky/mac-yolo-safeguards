# ASO discovery push — 2026-07-23

## Goal
Maximize discoverability for every honest, relevant query (Hermes Mobile, AI agent, remote Mac control, Tailscale pair, Leash approvals) without trademark spam or false claims.

## Reality check
- Ranking is **installs + ratings + retention**, not metadata alone.
- Generic **“hermes ai” / “hermes mobile”** are owned by competitors (Hen Works, Hermex, Dataphone “Hermes Mobile”, HermesPilot).
- We win **long-tail** first: `hermes leash`, exact brand name, Mac/remote/Tailscale operator queries.

## iOS (App Store Connect)
| Field | Value | Limit |
| --- | --- | --- |
| Name | `Hermes Mobile: AI Agent` | 23/30 |
| Subtitle | `Chat & approve Mac tools` | 24/30 |
| Keywords (100/100) | `leash,remote,coding,desktop,tailscale,pair,qr,usb,wifi,phone,command,computer,laptop,terminal,ssh,pc` | no name/subtitle word repeats |
| Promo | Hermes Mobile control plane + pair paths + Leash | 169/170 |

**Push result (2026-07-23):**
- **1.4 WAITING_FOR_REVIEW**: name/subtitle/keywords/description/promo accepted on version + appInfo localization.
- **1.3 READY_FOR_SALE**: promo text only (Apple blocks live name/subtitle edit). Live title remains **Hermes AI Agent Leash** until **1.4 ships**.

## Android (Play)
| Field | Free | Paid |
| --- | --- | --- |
| Title | Hermes Mobile: AI Agent | Hermes Mobile: AI Agent |
| Short | phone control · Mac AI agent · Chat · Tailscale · USB · Leash | Pay once · Hermes Mobile · Mac AI · chat · pair · Leash |
| Full | keyword-dense opener + differentiators | same family |

**Push result:** `push-play-listing.py --text-only --package both` **committed** for free + paid packages.

## Commands used
```bash
cd hermes-mobile
node scripts/push-asc-listing-copy.js
python3 scripts/push-play-listing.py --text-only --package both
```

## Honest outcome
Metadata + indexing improve **match + conversion**. They do **not** instantly put us above 10K-install competitors for head terms. Re-check ranks after 1.4 is live:
```bash
# iOS
curl -s 'https://itunes.apple.com/search?term=hermes%20mobile&entity=software&limit=200&country=us'
curl -s 'https://itunes.apple.com/search?term=hermes%20leash&entity=software&limit=20&country=us'
```
