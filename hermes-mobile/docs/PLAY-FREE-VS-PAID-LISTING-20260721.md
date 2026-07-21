# Play free vs paid listing — evidence (2026-07-21)

Agent: `cursor-listing-clarity` · Task: `T-LISTING-FREE-PAID-CLARITY` · Coord ASO `fd8be2dd`

## User-visible map

| Surface | Package / ID | Price model | Public status (evidence) | What makes money |
|---------|--------------|-------------|--------------------------|------------------|
| **Android free (what Igor’s screenshot shows)** | `com.iganapolsky.hermesmobile` | Free install + IAP | Play HTTP **200**; Uninstall/Open; “In-app purchases”; developer IgorGanapolsky | **`$4.99` once** IAP `hermes_pro_lifetime` (ACTIVE) |
| **Android paid download** | `com.iganapolsky.hermesmobile.paid` | `$4.99` paid download | Public URL **404**; Console: **In review** / “Your changes are now in review”; production `paid-15` completed API-side; US only | **Nothing yet** — not publicly live |
| **iOS** | `com.iganapolsky.hermesmobile` (ASC 6786778037) | **`$9.99` paid download** | iTunes lookup live; seller Igor Ganapolsky; `userRatingCount=0` | Paid download when someone buys; **no ratings ⇒ no proven store revenue here** |

## Why the free listing cannot show a sale price

Google Play rule: an app published as **free cannot be converted to paid download**. That is why the storefront shows free install (Uninstall/Open) + “In-app purchases”, not `$4.99` buy.

North star still: paid download on a **new** package (`.paid`). Until that package is public HTTP 200 with a price, Android cash path on the live listing is **IAP only**.

## Why the title says “Hermes AI Agent Leash” / “Hermes AI: Mac Agent Leash”

ASO history (`T-ASO-HERMES-AI-TITLE`, SERP agent `fd8be2dd`): put **Hermes AI** in the Play title for discovery against head-term search. “Leash” is the product noun for phone approve/deny of gateway tools — not a claim that this listing is a paid download.

**Conversion note:** title alone does not cause the free/sale confusion; the Play price UI does. Keep Hermes AI in title for discovery; lead short/full with **Free install · $4.99 unlock**. Do **not** claim organic #1 — Hen Works still owns “Hermes AI” SERP on velocity.

## Rank / money honesty (this session)

- **Not claiming #1** on “Hermes AI” or “Hermes Mobile”.
- **Not claiming revenue.** iOS ratings = 0; paid Android not live; free IAP purchases not proven in this turn.
- Poller `com.igor.hermes-mobile-play-paid-review-poll`: `status=in_review_public_only`, `publicHttp=404` (see `docs/proofs/play-paid-review-latest.json`).

## What we changed

- Play title (API + metadata): `Hermes AI: Mac Agent Leash` (≤30; Hermes AI discovery).
- Short: leads with **Free install** + `$4.99 once` + Mac / not phone AI.
- Full: FREE→Paid rule, IAP money path, `.paid` still in review, iOS `$9.99` contrast.

## Paid review — agent push

Console (Chrome, 2026-07-21): Publishing overview shows **Changes in review** / Managed publishing **off**; dashboard **Update status: In review**. No further Send-for-review click available. Agent cannot force Google review completion.
