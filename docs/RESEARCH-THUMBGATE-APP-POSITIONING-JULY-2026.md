# ThumbGate.app positioning research — July 2026

Status: decision-grade correction  
Verified: 2026-07-26 EDT  
Parallel research: initial failed run `trun_d3be5e813aa949708dfbfc4702467c9f`; corrective continuation `trun_d3be5e813aa94970beece9fa897b7b22`

## Verdict

ThumbGate.app is the Hermes web dashboard and optional paid Continuity product. It complements Hermes Mobile; it is not a workaround for a mobile app that cannot reach a Mac.

The mobile card shown on the physical Samsung is false:

> When your phone cannot reach your computer, sign in at ThumbGate.app to pair a Mac and continue in the browser.

Web Control still depends on an online paired machine. Opening a browser does not repair Tailscale, LAN discovery, an expired mobile credential, or an unreachable Mac. Paid Continuity solves a different job: eligible work can move to a fenced cloud runner when the Mac is offline.

## Product boundary

| Product surface | Primary job | What it does not claim |
|---|---|---|
| Hermes Mobile | Native phone and tablet access to Hermes, including chat and Leash approvals | It does not require ThumbGate.app to repair basic connectivity |
| ThumbGate.app Web Control | Browser dashboard for chats, machines, Leash controls, and signed machine pairing | It does not make an unreachable online Mac reachable |
| ThumbGate.app paid Continuity | Optional fenced VPS continuation for eligible work when the Mac is offline | It is not a general network tunnel and is not promised for every task |
| ThumbGate.ai | Separate pre-action checks and agent-governance product | Its $19 Pro plan and local dashboard are not ThumbGate.app pricing or features |

The live ThumbGate.app mobile section explicitly describes the intended relationship: Hermes Mobile pairs to the Mac the same way as the web dashboard and provides the same remote-control capabilities in a native pocket interface. That is a complementary-surface story, not a rescue story.

## Live plans

The following values were read from the live first-party page and billing API on 2026-07-26:

| Plan | Current price | Verified value |
|---|---:|---|
| Web Control | $0/month | Web dashboard, signed pairing, synced chats while online, pause or ask when offline |
| Pro Continuity | $10/month | Web Control plus 100 cloud continuations per 30 days, model routing, and a 14-day trial with five cloud runs |
| Team & Enterprise | $49/month | Pro plus 500 cloud continuations, additional model access, BYO key support, and priority cloud runner |

The Pro price is loaded dynamically. `GET https://thumbgate.app/api/billing/plan` returned:

```json
{"configured":true,"active":true,"unitAmount":1000,"currency":"usd","interval":"month"}
```

Pricing must be re-read before a major campaign. Mobile copy should link to the live pricing section instead of hard-coding a price that can drift.

## Honest availability language

The public landing page says Continuity can pick up *eligible* work on a VPS and that the capability is still being proven in real use. Therefore:

- Say “can keep eligible work moving.”
- Say “optional paid Continuity.”
- Do not say “always works,” “seamless failover,” or imply that every conversation can continue.
- Do not promise that ThumbGate.app fixes pairing, Tailscale, LAN discovery, or mobile connectivity.
- Do not conflate ThumbGate.app with ThumbGate.ai’s Self-Improving Firewall pitch.

## Recommended mobile card

This single variant matches the live product, makes Hermes Mobile the strong base product, and gives the user a paid-plan reason to click:

**Headline**

> Upgrade Hermes with ThumbGate

**Body**

> Add a web dashboard and paid Continuity to Hermes Mobile. Manage chats and Leash controls from any browser, and keep eligible work moving when your Mac is offline.

**CTA**

> See ThumbGate plans

**URL**

```text
https://thumbgate.app/?utm_source=hermes-mobile&utm_medium=app&utm_campaign=paid_companion#pricing
```

This copy intentionally does not vary by connectivity state. A product upsell should not appear to be an error-recovery instruction merely because the card is rendered below a connection panel.

## Measurement contract

The app already records promo impressions and taps. The funnel should preserve privacy boundaries and join only aggregate, content-free events:

1. `thumbgate_promo_view` with the mobile surface.
2. `thumbgate_promo_tap` with the canonical UTM URL.
3. Landing `paid_companion` session.
4. Pricing-section view.
5. Trial start.
6. Active paid subscription.

Do not send prompts, chat bodies, gateway credentials, device private keys, email addresses, IP addresses, cookies, or user-agent strings as promo analytics.

The regression gate should fail if any mobile promo copy contains rescue language such as “phone cannot reach,” “pair a Mac and continue,” “replacement,” or “instead.” It should also assert the `paid_companion` campaign and `#pricing` target.

## Research failure and correction

The first Parallel deep-research run produced a false negative. It searched the better-indexed ThumbGate.ai surface, declared that ThumbGate.app did not exist, and recommended the wrong product and $19 plan. This directly contradicted the named first-party domain.

The corrective continuation was given the exact first-party URLs. It then confirmed ThumbGate.app, Web Control, signed pairing, Leash, and paid Continuity. Its main remaining omissions were corrected by direct source readback:

- The live page also has a $49 Team & Enterprise plan.
- Hermes Mobile is this repository’s owned native product, not an unrelated third-party Android client.
- The existing mobile CTA opens the external browser; it is not an instrumented in-app WebView.

The reusable lesson is deterministic: named first-party URLs and live billing endpoints outrank search recall and generated research prose. A “deep research” label is not evidence.

## First-party evidence

- [ThumbGate.app live landing](https://thumbgate.app/)
- [ThumbGate.app machine-readable product description](https://thumbgate.app/llms.txt)
- [ThumbGate.app live billing plan](https://thumbgate.app/api/billing/plan)
- [ThumbGate.app ARD catalog](https://thumbgate.app/.well-known/ai-catalog.json)
- `apps/hermes-control-plane/app/page.tsx` on `origin/main` for the live pricing and Hermes Mobile sections
- `apps/hermes-control-plane/app/BillingPlan.tsx` for dynamic Pro pricing
- `apps/hermes-control-plane/app/llms.txt/route.ts` for the canonical capability and privacy boundaries

Raw receipts are retained in:

- `parallel-research/thumbgate-app-positioning-july-2026-initial-failed.{md,json}`
- `parallel-research/thumbgate-app-positioning-july-2026.{md,json}`
