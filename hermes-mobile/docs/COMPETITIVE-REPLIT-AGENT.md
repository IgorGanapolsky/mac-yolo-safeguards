# Hermes Mobile vs Replit Agent Mobile (2026-07-09)

This document is a factual comparison for positioning and marketing copy.

## Scope and sources

- Replit public pricing page: <https://replit.com/pricing>
- Replit mobile docs: <https://docs.replit.com/references/platforms/mobile-app>
- Replit AI billing docs: <https://docs.replit.com/billing/ai-billing>
- Replit mobile product page: <https://replit.com/products/mobile>
- Hermes Mobile repo truth:
  - `docs/REAL-USER-READINESS.md`
  - `src/constants/monetization.ts`
  - `src/services/thumbgateIap.ts`
  - `docs/proofs/continuous/latest.json`

## Executive positioning

- Hermes Mobile: mobile control surface for your own gateway, with Pro safety controls at $19.99/month and no credit-metered chat checkpoints.
- Replit mobile: cloud app-building interface on phone with monthly credits plus usage-based billing as Agent effort increases.
- Honest caveat: Hermes Android distribution is live; Hermes iOS remains in review and is not publicly searchable yet.

## Comparison matrix

| Category | Hermes Mobile | Replit Agent mobile |
|---|---|---|
| Core product job | Operate and supervise AI runs on your own machine/gateway from phone | Build apps in Replit cloud from phone |
| Entry paid price | `thumbgate_leash_monthly` at **$19.99/mo** (Play active in repo evidence) | Core listed at **$25/mo** monthly or **$20/mo annual effective** |
| Usage billing model | No effort-based credit checkpoints in app flow; Pro unlock is subscription gated | Credits + effort-based usage billing; all Agent interactions billable (including Plan Mode) |
| Overage behavior | No "credit bucket depletion" model in Hermes docs | After monthly credits, usage continues via pay-as-you-go billing settings |
| Where code/runtime lives | User-operated Mac/gateway profile(s) | Replit-hosted cloud runtime |
| Tailscale / private network path | First-class in product/readiness docs (cellular + tunnel + profile workflows) | Not positioned as a user-operated Tailscale gateway control product |
| Local models (e.g., Ollama on your Mac) | Supported in stack and operations (`custom:ollama-local-32k` seen in agent status/proofs) | Replit Agent uses managed cloud models and third-party APIs billed through Replit |
| Credit burn risk | No Replit credit economy involved | Shared credits also cover Agent/cloud services; heavy use can exceed included credits |
| Native mobile app creation from phone | Not the primary product promise; Hermes is itself a mobile companion app | Replit mobile app focuses web app building; docs say native iOS/Android app build/submit workflow is on web Project Editor |
| Mobile plan purchase constraints | Hermes Pro sold as store subscription in-app | Replit docs: Pro cannot be purchased inside mobile app; must buy on replit.com |
| Distribution status (Hermes-specific) | Android Play listing public; iOS still in ASC review/not searchable | Replit mobile app available on App Store / Play (per Replit mobile pages) |

## Messaging guidance (truth-safe)

Use:

- "Run agents on your own machine, not in someone else's cloud IDE."
- "No Replit credit burn for every planning conversation."
- "Tailscale-friendly control path for your own gateway."
- "Cheaper starting point for mobile supervision: $19.99 vs Replit Core $25 monthly."

Avoid:

- "Hermes replaces Replit for cloud app generation." (different primary jobs)
- "Hermes is already fully public on iOS." (not true today)
- "Hermes has zero operating cost." (not proven; only no Replit credits claim is safe)

## Known blockers and open gaps

- Hermes iOS App Store visibility is still blocked (`ASC still in review / not searchable` in readiness doc).
- Hermes continuous E2E latest status is `e2e=skipped` when no USB Android device is attached, so device-loop proof is conditional.
- Replit credit amounts show mixed surfaced values across pages (`$25 monthly credits` on pricing vs `$20 credits` called out in mobile billing docs for mobile-purchased Core). Keep copy focused on "credits + usage billing" instead of one hard number unless page/date is cited.

